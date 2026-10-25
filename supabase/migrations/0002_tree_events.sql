-- Our Family Home — Phase 2b + 3 migration (family tree edges, events)
-- Depends on 0001_init.sql. Run in order: supabase db push (or SQL editor).

-- ============================================================================
-- PHASE 2b — family_relations (tree edges)
-- ============================================================================
create type public.relation_kind as enum ('parent', 'spouse', 'sibling');

create table public.family_relations (
  id          uuid primary key default gen_random_uuid(),
  from_member uuid not null references public.profiles (id) on delete cascade,
  to_member   uuid not null references public.profiles (id) on delete cascade,
  kind        public.relation_kind not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- No self-loops.
  check (from_member <> to_member),
  -- Canonical direction so (a,b) and (b,a) collide on insert: symmetric kinds
  -- store the smaller uuid first; 'parent' rows are stored child-first
  -- (from = child, to = parent) with a deterministic order, flipped in the app.
  check (
    (kind = 'parent') or
    (kind in ('spouse','sibling') and from_member < to_member)
  ),
  unique (from_member, to_member, kind)
);

alter table public.family_relations enable row level security;

-- The whole family may read the tree (private app, trusted members).
create policy relations_read on public.family_relations
  for select to authenticated using (true);

-- Coordinators+ maintain edges. (DELETE/UPDATE use `using`, INSERT uses `with check`.)
create policy relations_leader_write on public.family_relations
  for all to authenticated
  using (public.jwt_role() in ('coordinator','treasurer','admin'))
  with check (public.jwt_role() in ('coordinator','treasurer','admin'));

-- Validation + audit, enforced in the database (never trust the client):
create or replace function public.guard_relation_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Cannot relate two people unless you can see both (RLS already ensures
    -- reads, but double-check existence):
    if not exists (select 1 from public.profiles where id = new.from_member)
       or not exists (select 1 from public.profiles where id = new.to_member) then
      raise exception 'Both members must exist';
    end if;
    perform public.log_audit(new.created_by, 'relation.create', 'family_relations',
      new.id::text, jsonb_build_object('from', new.from_member, 'to', new.to_member, 'kind', new.kind));
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform public.log_audit(auth.uid(), 'relation.delete', 'family_relations',
      old.id::text, jsonb_build_object('from', old.from_member, 'to', old.to_member, 'kind', old.kind));
    return old;
  end if;
  return new;
end $$;

create trigger relations_guard
  before insert or delete on public.family_relations
  for each row execute function public.guard_relation_change();

-- Edge list consumed by the client-side tree builder.
create or replace view public.tree_edges as
  select from_member, to_member, kind from public.family_relations;

-- ============================================================================
-- PHASE 3 — events (birthdays, anniversaries, meetups)
-- ============================================================================
create type public.event_kind as enum ('birthday', 'anniversary', 'meetup');

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  kind          public.event_kind not null,
  title         text not null,
  occurs_on     date not null,                 -- next occurrence; birthdays roll forward
  member_id     uuid references public.profiles (id) on delete cascade,  -- person(s) honoured
  branch_id     uuid references public.branches (id) on delete set null,
  venue         text,
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Birthdays/anniversaries must point at a member; meetups need a title only.
  check ((kind = 'meetup') or (member_id is not null)),
  check (char_length(trim(title)) > 0)
);

create index events_occurs_on_idx on public.events (occurs_on);

alter table public.events enable row level security;

create policy events_read on public.events
  for select to authenticated using (true);

-- Members may propose an event (e.g. add their own birthday);
-- coordinators+ may edit/delete anything.
create policy events_insert_own_or_leader on public.events
  for insert to authenticated
  with check (
    public.jwt_role() in ('coordinator','treasurer','admin')
    or (auth.uid() = member_id and kind = 'birthday')   -- self-service: only your own birthday
  );

create policy events_leader_update on public.events
  for update to authenticated
  using (public.jwt_role() in ('coordinator','treasurer','admin'))
  with check (public.jwt_role() in ('coordinator','treasurer','admin'));

create policy events_owner_or_leader_delete on public.events
  for delete to authenticated
  using (
    public.jwt_role() in ('coordinator','treasurer','admin')
    or auth.uid() = member_id
  );

create or replace function public.touch_event()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger events_touch before update on public.events
  for each row execute function public.touch_event();

-- Roll recurring dates (birthday/anniversary) forward to the next occurrence.
-- Idempotent; call nightly via a scheduled job (pg_cron / Supabase cron addon):
--   select cron.schedule('roll-events', '0 0 * * *', $$select public.roll_forward_events()$$);
-- Feb-29 birthdays roll to Feb-28 in non-leap years (Postgres clamps make_date).
create or replace function public.roll_forward_events()
returns int
language plpgsql security definer set search_path = public as $$
declare v_updated int;
begin
  -- Allowed only from a scheduler (no JWT -> anon role) or an admin session.
  if auth.uid() is not null and public.jwt_role() <> 'admin' then
    raise exception 'Only admins may roll events manually';
  end if;

  update public.events e
     set occurs_on =
       case
         when make_date(extract(year from current_date)::int,
                        extract(month from e.occurs_on)::int,
                        extract(day from e.occurs_on)::int) >= current_date
         then make_date(extract(year from current_date)::int,
                        extract(month from e.occurs_on)::int,
                        extract(day from e.occurs_on)::int)
         else make_date(extract(year from current_date)::int + 1,
                        extract(month from e.occurs_on)::int,
                        extract(day from e.occurs_on)::int)
       end
   where e.kind in ('birthday','anniversary')
     and e.occurs_on < current_date;
  get diagnostics v_updated = row_count;
  return v_updated;
end $$;

revoke execute on function public.roll_forward_events() from anon, authenticated;
grant  execute on function public.roll_forward_events() to service_role;
