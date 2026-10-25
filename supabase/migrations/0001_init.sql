-- Our Family Home — Phase 1 migration (core identity + security foundation)
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
-- NEVER run this against a database that already holds real member data without a backup.

-- ============================================================================
-- 1. Enums
-- ============================================================================
create type public.family_role as enum ('member', 'coordinator', 'treasurer', 'admin');

-- ============================================================================
-- 2. Branches (family sub-groups)
-- ============================================================================
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  order_hint  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 3. Profiles — one row per authenticated family member
--    id references auth.users; role is duplicated into the JWT via app_metadata
--    so RLS policies never need to query this table (no recursive policy reads).
-- ============================================================================
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  branch_id   uuid references public.branches (id) on delete set null,
  role        public.family_role not null default 'member',
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- 4. Audit log — append-only from day one (every future feature writes here)
-- ============================================================================
create table public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor_id  uuid references public.profiles (id) on delete set null,
  action    text not null,             -- e.g. 'profile.update', 'auth.signup'
  entity    text not null,             -- e.g. 'profiles'
  entity_id text not null,
  detail    jsonb not null default '{}'::jsonb
);

-- Hard rule: nobody may UPDATE or DELETE audit rows, not even client roles.
revoke update, delete on table public.audit_log from public, anon, authenticated;

-- Helper used by triggers and server-side code.
create or replace function public.log_audit(
  p_actor uuid, p_action text, p_entity text, p_entity_id text, p_detail jsonb default '{}'
) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, detail)
  values (p_actor, p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- ============================================================================
-- 5. Auth role claim -> helpers
--    Tokens carry app_metadata.role (set when an admin updates profiles.role;
--    see guard trigger + note in README about Supabase custom claims /
--    "After Sign In" hook if you map it there instead).
--    Fallback: if the claim is missing (legacy tokens), treat as 'member'.
-- ============================================================================
create or replace function public.jwt_role()
returns public.family_role
language sql stable set search_path = public as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}')::public.family_role,
    'member'::public.family_role
  );
$$;

create or replace function public.is_treasurer_or_admin()
returns boolean language sql stable as $$
  select public.jwt_role() in ('treasurer','admin');
$$;

-- ============================================================================
-- 6. Row Level Security
-- ============================================================================
alter table public.branches  enable row level security;
alter table public.profiles  enable row level security;
alter table public.audit_log enable row level security;

-- Branches: any authenticated relative may read; only admins write.
create policy branches_read on public.branches
  for select to authenticated using (true);
create policy branches_admin_write on public.branches
  for all to authenticated using (public.jwt_role() = 'admin') with check (public.jwt_role() = 'admin');

-- Profiles: the whole family directory is visible (private app, trusted members).
create policy profiles_read on public.profiles
  for select to authenticated using (true);

-- Members update their own profile, but CANNOT change their own role —
-- role changes are admin/treasurer-only (policy + trigger below).
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (auth.uid()))
  with check (id = (auth.uid()) and role = public.jwt_role());

create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.jwt_role() = 'admin') with check (public.jwt_role() = 'admin');

-- Audit log: readable by coordinators+ (transparency). Writes happen only via
-- security-definer functions / service role (which bypasses RLS).
create policy audit_read_leaders on public.audit_log
  for select to authenticated using (public.jwt_role() in ('coordinator','treasurer','admin'));

-- Nobody inserts/updates/deletes audit rows directly from clients:
revoke insert on table public.audit_log from anon, authenticated;

-- ============================================================================
-- 7. Profile bootstrap trigger — creates a profiles row on sign-up.
--    First-ever user becomes 'admin'; everyone else starts as 'member'.
--    (Supabase email-invites mean strangers cannot self-register.)
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role public.family_role;
begin
  select case when count(*) = 0 then 'admin'::public.family_role
              else 'member'::public.family_role end
    into v_role from public.profiles;

  insert into public.profiles (id, full_name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'full_name', 'New member'),
          v_role);

  perform public.log_audit(new.id, 'auth.signup', 'profiles', new.id::text,
                           jsonb_build_object('initial_role', v_role));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Guard: role changes must come from a treasurer/admin session, and every
-- profile edit is recorded in the audit log.
create or replace function public.guard_profile_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_treasurer_or_admin() then
    raise exception 'Only treasurers/admins may change roles';
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    perform public.log_audit(new.id, 'profile.update', 'profiles', new.id::text,
      jsonb_build_object('role_before', old.role, 'role_after', new.role,
                         'branch_before', old.branch_id, 'branch_after', new.branch_id));
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_change();

-- ============================================================================
-- 8. Seed branches ONLY (no people, no money). Safe to re-run.
--    Adjust names to your actual family branches before running.
-- ============================================================================
insert into public.branches (name, order_hint) values
  ('Elder son''s branch',   1),
  ('Daughters'' branch',    2),
  ('Younger son''s branch', 3)
on conflict (name) do nothing;
