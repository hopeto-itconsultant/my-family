-- ============================================================================
-- 0013 — Family policy update: merge COORDINATOR into TREASURER ("steward").
--   * One steward role now covers everything a coordinator did (tree, events,
--     history moderation, assets register) PLUS the Mission Fund entries of
--     0008. The UI still calls it "Treasurer".
--   * Existing profiles with role='coordinator' are converted to 'treasurer'.
--   * The enum value 'coordinator' is intentionally KEPT so old JWTs remain
--     valid; no policy references it any more (treated as plain member).
--   * Fund money rows stay manual-entry only (0008 untouched for contributions/
--     expenses); multiple stewards are now allowed, each change audited.
-- Run after 0001..0012 (Supabase SQL editor or `supabase db push`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Data migration: coordinators -> treasurer BEFORE dropping the index
--    (the partial unique index on role='treasurer' would otherwise reject
--     converting a second coordinator).
-- ----------------------------------------------------------------------------
update public.profiles
   set role = 'treasurer', updated_at = now()
 where role = 'coordinator';

-- ----------------------------------------------------------------------------
-- 2) Relax the single-treasurer rule from 0008 (multiple stewards allowed;
--    the family decides who they are; every role change is already audited
--    by the profile trigger from 0001).
-- ----------------------------------------------------------------------------
drop index if exists public.profiles_single_treasurer_idx;

-- ----------------------------------------------------------------------------
-- 3) Helper predicate used by all rewritten policies below.
-- ----------------------------------------------------------------------------
create or replace function public.is_steward()
returns boolean
language sql stable
set search_path = public   -- [hws fix]
as $$
  select public.jwt_role() in ('treasurer','admin');
$$;
-- [hws fix] helper: signed-in only, like other 0009 helpers
revoke execute on function public.is_steward() from public, anon;
grant execute on function public.is_steward() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) One-time audit record of the merge, written as the operator running this
--    migration (service_role bypasses audit_log RLS; UPDATE/DELETE remain
--    revoked at column level, so the trail stays append-only).
-- ----------------------------------------------------------------------------
insert into public.audit_log (actor_id, action, entity, entity_id, detail)
select null, 'role.merge_coordinator', 'profiles', p.id::text,
       jsonb_build_object('from', 'coordinator', 'to', 'treasurer')
  from public.profiles p
 where p.role = 'treasurer';

-- ----------------------------------------------------------------------------
-- 5) FAMILY RELATIONS (0002) — leader write policy
-- ----------------------------------------------------------------------------
drop policy if exists relations_leader_write on public.family_relations;
create policy relations_leader_write on public.family_relations
  for all to authenticated
  using (public.is_steward())
  with check (public.is_steward());

-- ----------------------------------------------------------------------------
-- 6) EVENTS (0002)
-- ----------------------------------------------------------------------------
drop policy if exists events_insert_own_or_leader on public.events;
create policy events_insert_own_or_leader on public.events
  for insert to authenticated
  with check (
    public.is_steward()
    or (auth.uid() = member_id and kind = 'birthday')   -- self-service unchanged
  );

drop policy if exists events_leader_update on public.events;
create policy events_leader_update on public.events
  for update to authenticated
  using (public.is_steward())
  with check (public.is_steward());

drop policy if exists events_owner_or_leader_delete on public.events;
create policy events_owner_or_leader_delete on public.events
  for delete to authenticated
  using (public.is_steward() or auth.uid() = member_id);

-- ----------------------------------------------------------------------------
-- 7) PRAYERS / ACHIEVEMENTS / HISTORY / PHOTOS / ASSETS (0003)
-- ----------------------------------------------------------------------------
drop policy if exists prayer_update_leader on public.prayer_requests;
create policy prayer_update_leader on public.prayer_requests
  for update to authenticated
  using (public.is_steward())
  with check (public.is_steward());

drop policy if exists prayer_delete_leader on public.prayer_requests;
create policy prayer_delete_leader on public.prayer_requests
  for delete to authenticated
  using (public.is_steward());

drop policy if exists achievement_delete on public.achievements;
create policy achievement_delete on public.achievements
  for delete to authenticated
  using (created_by = auth.uid() or public.is_steward());

drop policy if exists history_update on public.history_entries;
create policy history_update on public.history_entries
  for update to authenticated
  using (created_by = auth.uid() or public.is_steward())
  with check (created_by = auth.uid() or public.is_steward());

drop policy if exists history_delete on public.history_entries;
create policy history_delete on public.history_entries
  for delete to authenticated
  using (public.is_steward());

drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_steward());  -- [hws fix] photos column is uploaded_by

drop policy if exists assets_update on public.family_assets;
create policy assets_update on public.family_assets
  for update to authenticated
  using (public.is_steward())
  with check (public.is_steward());

drop policy if exists assets_delete on public.family_assets;
create policy assets_delete on public.family_assets
  for delete to authenticated
  using (public.is_steward());

-- Storage objects (photos bucket): owner-or-leader delete
drop policy if exists "photos delete owner or leader" on storage.objects;
create policy "photos delete owner or leader" on storage.objects
  for delete to authenticated
  using (bucket_id = 'family-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.is_steward()));

-- ----------------------------------------------------------------------------
-- 8) AUDIT LOG READ (0001): was coordinators+; now stewards (treasurer/admin).
-- ----------------------------------------------------------------------------
drop policy if exists "audit_read_leaders" on public.audit_log;
create policy "audit_read_leaders" on public.audit_log
  for select to authenticated
  using (public.is_steward());

-- ----------------------------------------------------------------------------
-- 9) NIGHTLY REMINDERS (0006): branch nudges went to ('coordinator',
--    'treasurer','admin'). Coordinator rows no longer exist, so re-issue the
--    function with stewards only. Body identical to 0006 otherwise.
-- ----------------------------------------------------------------------------
create or replace function public.generate_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  -- Own upcoming events (next 3 days); occurs_on is rolled forward nightly.
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select e.member_id, 'event',
         '🎂 ' || e.title || ' is ' ||
           case when e.occurs_on = current_date then 'today'
                when e.occurs_on = current_date + 1 then 'tomorrow'
                else 'in ' || (e.occurs_on - current_date)::text || ' days' end,
         coalesce(e.notes, ''), '/events',
         'own-event-' || e.id || '-' || to_char(e.occurs_on, 'YYYY-MM-DD')
  from public.events e
  where e.member_id is not null
    and e.occurs_on between current_date and current_date + 3
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;

  -- Stewards (treasurers/admins): heads-up about branch events in next 7 days.
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select p.id, 'event',
         'Upcoming: ' || e.title || ' (' || to_char(e.occurs_on, 'DD Mon') || ')',
         'As ' || p.role || ' you may want to coordinate.', '/events',
         'coord-event-' || e.id || '-' || to_char(e.occurs_on, 'YYYY-MM-DD') || '-' || p.id
  from public.events e
  join public.profiles p on p.branch_id = e.branch_id
  where e.occurs_on between current_date and current_date + 7
    and p.role in ('treasurer','admin')
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  -- Monthly Mission Fund nudge on the 25th (visible truth: pending != received).
  if extract(day from current_date) = 25 then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select p.id, 'fund',
           'Mission Fund reminder',
           'If you planned a contribution this month, tell the treasurer — payments (cash or UPI/online) appear in the Mission Fund tab as “awaiting verification”. Only treasurer-verified payments count toward the balance.',
           '/fund',
           'fund-nudge-' || to_char(current_date, 'YYYY-MM') || '-' || p.id
    from public.profiles p
    where not exists (
      select 1 from public.contributions c
      where c.member_id = p.id
        and c.status = 'verified'
        and c.month_ref = to_char(current_date, 'YYYY-MM')
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return n;
end;
$$;

revoke execute on function public.generate_reminders() from public, anon, authenticated; -- [hws fix] + public
grant execute on function public.generate_reminders() to service_role;

comment on type public.family_role is
  'member | coordinator (legacy — merged into treasurer by 0013) | treasurer | admin';
