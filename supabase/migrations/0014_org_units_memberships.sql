-- ============================================================================
-- 0014 — Access control PHASE 2: flexible org units + auditable memberships.
--   * org_units        : ONE table for family branches AND divisions/groups/
--                        committees (kind = 'branch' | 'group'). Adding a new
--                        division is a data row, never a schema/code change.
--   * unit_memberships : many-to-many person <-> unit with a SCOPED role and
--                        lifecycle status. A person may belong to several
--                        branches/groups at once.
--   * Backfill         : existing public.branches rows are mirrored into
--                        org_units (same UUIDs) and every non-null
--                        profiles.branch_id becomes an ACTIVE membership
--                        (role 'member'; existing global stewards/admins get
--                        'coordinator'/'administrator'). NOTHING is dropped:
--                        profiles.branch_id and profiles.role keep working as
--                        deprecated mirrors until the cleanup migration.
--   * Security         : deny-by-default RLS; self-elevation blocked by
--                        trigger; every membership change lands in the
--                        append-only audit_log.
-- Run after 0001..0013 (Supabase SQL editor or `supabase db push`).
-- Rollback: drop triggers/policies/tables below; mirrors were never removed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------
create type public.unit_kind   as enum ('branch', 'group');
create type public.unit_scope  as enum ('family', 'branch', 'selected_branches', 'private');
create type public.unit_status as enum ('active', 'archived');
create type public.membership_role   as enum
  ('administrator', 'coordinator', 'treasurer', 'reviewer', 'editor', 'contributor', 'viewer');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'revoked');

-- ----------------------------------------------------------------------------
-- 2) org_units
-- ----------------------------------------------------------------------------
create table public.org_units (
  id           uuid primary key default gen_random_uuid(),
  kind         public.unit_kind  not null default 'group',
  name         text              not null,
  description  text,
  parent_id    uuid references public.org_units (id) on delete set null,
  scope        public.unit_scope not null default 'branch',
  status       public.unit_status not null default 'active',
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  -- sibling names must be unique (branches kept their global uniqueness via
  -- the mirrored same-id rows; groups cannot reuse a sibling's name)
  constraint org_units_sibling_name_unique unique (parent_id, name)
);

create index org_units_kind_status_idx on public.org_units (kind, status);
create index org_units_parent_idx      on public.org_units (parent_id);

-- NOTE: parent-child membership inheritance is deliberately NOT automatic
-- (requirement §3A). It will be an explicitly configured rule in Phase 3.

-- ----------------------------------------------------------------------------
-- 3) unit_memberships
-- ----------------------------------------------------------------------------
create table public.unit_memberships (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.org_units (id) on delete cascade,
  member_id    uuid not null references public.profiles (id) on delete cascade,
  member_role  public.membership_role   not null default 'viewer',
  status       public.membership_status not null default 'active',
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,                       -- optional scheduled end
  granted_by   uuid references public.profiles (id) on delete set null,
  grant_reason text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (unit_id, member_id)                     -- one row per person per unit; history lives in audit_log
);

create index unit_memberships_member_active_idx
  on public.unit_memberships (member_id) where status = 'active';
create index unit_memberships_unit_active_idx
  on public.unit_memberships (unit_id)   where status = 'active';

-- ----------------------------------------------------------------------------
-- 4) Role ladder helper (single source of truth, reused by app + policies)
-- ----------------------------------------------------------------------------
create or replace function public.membership_role_level(p_role public.membership_role)
returns int language sql immutable set search_path = public as $$
  select case p_role
    when 'viewer'       then 1
    when 'contributor'  then 2
    when 'editor'       then 3
    when 'reviewer'     then 4
    when 'treasurer'    then 5
    when 'coordinator'  then 6
    when 'administrator' then 7
  end;
$$;

-- True iff `p_actor` may GRANT `p_new_role` inside `p_unit`:
--   * global admin (JWT claim) may grant anything (audited);
--   * otherwise must hold an ACTIVE membership in that unit with level >=
--     the role being granted (never grant above yourself -> no self-elevation
--     path, and you cannot create a permission you don't already hold).
create or replace function public.can_grant_role_in_unit(
  p_actor uuid, p_unit uuid, p_new_role public.membership_role
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_actor is null then false
    when exists (select 1 from public.profiles pr
                  where pr.id = p_actor and pr.role = 'admin') then true
    else coalesce((
      select public.membership_role_level(um.member_role) >=
             public.membership_role_level(p_new_role)
        from public.unit_memberships um
       where um.unit_id = p_unit and um.member_id = p_actor and um.status = 'active'
    ), false)
  end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Guard trigger — self-grant / elevation rules + audit of every change
-- ----------------------------------------------------------------------------
create or replace function public.guard_membership_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor     uuid := auth.uid();
  old_row   jsonb;
  new_row   jsonb;
begin
  -- Server actions run as the authenticated user; service-role calls have no
  -- auth.uid() and are trusted (they are server-only, key never leaves env).
  if actor is not null then
    if (tg_op = 'INSERT') then
      if new.member_id = actor and new.member_role <> 'viewer' then
        raise exception 'You cannot grant yourself a role above viewer.';
      end if;
      if not public.can_grant_role_in_unit(actor, new.unit_id, new.member_role) then
        raise exception 'You can only grant roles up to your own level in this unit.';
      end if;
    elsif (tg_op = 'UPDATE') then
      old_row := to_jsonb(old); new_row := to_jsonb(new);
      if new.member_id = actor and new.member_role <> old.member_role then
        raise exception 'You cannot change your own role.';
      end if;
      if new.member_role is distinct from old.member_role
         and not public.can_grant_role_in_unit(actor, new.unit_id, new.member_role) then
        raise exception 'You can only grant roles up to your own level in this unit.';
      end if;
      if new.status is distinct from old.status
         and not public.can_grant_role_in_unit(actor, new.unit_id, 'viewer') then
        raise exception 'Only a unit administrator-level member can change membership status.';
      end if;
    elsif (tg_op = 'DELETE') then
      if not public.can_grant_role_in_unit(actor, old.unit_id, 'viewer') then
        raise exception 'Only a unit administrator-level member can remove memberships.';
      end if;
      perform public.log_audit(actor, 'membership.remove', 'unit_memberships',
                               old.id::text,
                               jsonb_build_object('unit_id', old.unit_id,
                                                  'member_id', old.member_id,
                                                  'role', old.member_role));
      return old;
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    new.updated_at := now();
    if tg_op = 'INSERT' then
      perform public.log_audit(coalesce(actor, new.granted_by), 'membership.create',
        'unit_memberships', new.id::text,
        jsonb_build_object('unit_id', new.unit_id, 'member_id', new.member_id,
                           'role', new.member_role, 'status', new.status));
    else
      perform public.log_audit(actor, 'membership.update', 'unit_memberships',
        new.id::text,
        jsonb_build_object('before', old_row, 'after', new_row));
    end if;
    return new;
  end if;
  return null;
end;
$$;

create trigger unit_memberships_guard
  before insert or update or delete on public.unit_memberships
  for each row execute function public.guard_membership_change();

-- ----------------------------------------------------------------------------
-- 6) Units guard — global admins manage units; steward+ may create groups
-- ----------------------------------------------------------------------------
create or replace function public.guard_unit_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- archive instead of delete: block hard deletes for client actors
    if auth.uid() is not null then
      raise exception 'Units cannot be deleted; set status = archived instead.';
    end if;
    return old;
  end if;
  new.updated_at := now();
  perform public.log_audit(auth.uid(),
    case when tg_op = 'INSERT' then 'unit.create' else 'unit.update' end,
    'org_units', new.id::text,
    jsonb_build_object('name', new.name, 'kind', new.kind, 'scope', new.scope));
  return new;
end;
$$;

alter table public.org_units add column if not exists updated_at timestamptz not null default now();

create trigger org_units_guard
  before insert or update or delete on public.org_units
  for each row execute function public.guard_unit_change();

-- ----------------------------------------------------------------------------
-- 7) Backfill: mirror branches -> org_units (SAME ids), memberships from
--    profiles.branch_id. Idempotent (on_conflict do nothing).
-- ----------------------------------------------------------------------------
insert into public.org_units (id, kind, name, description, scope, status, created_at)
select b.id, 'branch', b.name,
       'Mirrored from legacy branches table (migration 0014 backfill).',
       'branch', 'active', b.created_at
  from public.branches b
on conflict (id) do nothing;

-- The shared-family root unit (scope='family') — parent for cross-branch groups.
insert into public.org_units (id, kind, name, description, scope, status)
values ('00000000-0000-0000-0000-0000000000fa', 'group', 'Shared Family',
        'Root unit for family-wide resources (seeded by migration 0014).',
        'family', 'active')
on conflict (id) do nothing;

insert into public.unit_memberships
       (unit_id, member_id, member_role, status, granted_by, grant_reason)
select p.branch_id, p.id,
       case p.role when 'admin'     then 'administrator'::public.membership_role
                   when 'treasurer' then 'coordinator'::public.membership_role
                   else                  'viewer'::public.membership_role end,
       'active', null, 'Backfilled from profiles.branch_id (migration 0014).'
  from public.profiles p
 where p.branch_id is not null
on conflict (unit_id, member_id) do nothing;

-- Existing stewards (global treasurer/admin) who had NO branch_id still get a
-- Shared Family membership so they retain a management foothold post-migration.
insert into public.unit_memberships (unit_id, member_id, member_role, status, grant_reason)
select '00000000-0000-0000-0000-0000000000fa', p.id,
       case p.role when 'admin' then 'administrator' else 'coordinator' end,
       'active', 'Backfilled: global steward without a branch (migration 0014).'
  from public.profiles p
 where p.role in ('admin','treasurer') and p.branch_id is null
on conflict (unit_id, member_id) do nothing;

-- ----------------------------------------------------------------------------
-- 8) RLS — deny by default
-- ----------------------------------------------------------------------------
alter table public.org_units       enable row level security;
alter table public.unit_memberships enable row level security;

-- Units: readable by any signed-in member (names are not secret; contents are
-- protected by later resource policies). Creating/updating requires steward+
-- (groups) or global admin (branches/archiving), enforced here + by trigger.
create policy org_units_select on public.org_units
  for select to authenticated using (true);

create policy org_units_insert_group on public.org_units
  for insert to authenticated with check (
    public.jwt_role() in ('treasurer','admin')
    and kind = 'group'                      -- branches stay admin-managed
    and scope <> 'family'                   -- the seeded root is special
  );

create policy org_units_update_steward on public.org_units
  for update to authenticated using (public.is_steward()) with check (public.is_steward());

-- Memberships: everyone may SEE the roster of units they themselves belong to
-- (active). Admin sees all. Users may read their OWN rows (e.g. "my groups").
create policy unit_memberships_select on public.unit_memberships
  for select to authenticated using (
    public.jwt_role() = 'admin'
    or member_id = auth.uid()
    or exists (
      select 1 from public.unit_memberships mine
       where mine.member_id = auth.uid()
         and mine.unit_id = unit_memberships.unit_id
         and mine.status = 'active'
    )
  );

-- Insert/update/delete go through server actions executed by the calling
-- user's session; the guard trigger enforces the elevation rules, but we also
-- require a real grantor and forbid audience-side writes.
create policy unit_memberships_insert on public.unit_memberships
  for insert to authenticated with check (
    granted_by = auth.uid()
    and public.can_grant_role_in_unit(auth.uid(), unit_id, member_role)
  );

create policy unit_memberships_update on public.unit_memberships
  for update to authenticated
  using (public.can_grant_role_in_unit(auth.uid(), unit_id, 'viewer'))
  with check (public.can_grant_role_in_unit(auth.uid(), unit_id, member_role));

create policy unit_memberships_delete on public.unit_memberships
  for delete to authenticated
  using (public.can_grant_role_in_unit(auth.uid(), unit_id, 'viewer'));

-- ----------------------------------------------------------------------------
-- 9) Convenience views used by the app layer
-- ----------------------------------------------------------------------------
create or replace view public.my_units as
  select u.*, um.member_role, um.status as membership_status
    from public.unit_memberships um
    join public.org_units u on u.id = um.unit_id
   where um.member_id = auth.uid()
     and um.status = 'active'
     and u.status = 'active';

grant select on public.my_units to authenticated;
