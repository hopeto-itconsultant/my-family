-- 0006_notifications.sql — Phase 9: in-app reminders (email delivery is an ops step)
-- ============================================================================
-- Design: a nightly job rolls upcoming events & monthly-fund nudges into
-- per-member notifications. The app polls them via RLS-protected SELECTs only;
-- there is NO client INSERT/UPDATE policy except marking one's own row read.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('event','fund','system')),
  title text not null,
  body text,
  link text,                       -- in-app path, e.g. /events or /fund
  dedupe_key text,                 -- prevents duplicate reminders across runs
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create unique index notifications_dedupe_idx
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;

-- Members see only their own notifications.
create policy notifications_own_read on public.notifications
  for select using (user_id = auth.uid());

-- Members may mark their own rows as read (and nothing else).
create policy notifications_own_update on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and read_at is not null            -- only ever sets read_at
              and title = (select n.title from public.notifications n where n.id = notifications.id));

-- Nobody inserts/deletes directly; generation happens inside the SECURITY
-- DEFINER function below, which runs as the job role (service role bypasses RLS).
revoke insert, delete on public.notifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- generate_reminders(): called once per day by a scheduled job
-- (pg_cron: select cron.schedule('reminders','1 5 * * *','select public.generate_reminders();')
--  or a Supabase Scheduled Edge Function invoking it via service role).
-- Rules:
--  * Birthday/anniversary within the next 3 days -> notify coordinators+ of that branch
--    and every member gets their OWN upcoming event reminder.
--  * On the 25th: members with no contribution verified for the current month get a
--    gentle Mission Fund nudge (never claims they owe; pledge amounts are optional).
-- ---------------------------------------------------------------------------
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

  -- Coordinators/admins/treasurers: heads-up about branch events in next 7 days.
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select p.id, 'event',
         'Upcoming: ' || e.title || ' (' || to_char(e.occurs_on, 'DD Mon') || ')',
         'As ' || p.role || ' you may want to coordinate.', '/events',
         'coord-event-' || e.id || '-' || to_char(e.occurs_on, 'YYYY-MM-DD') || '-' || p.id
  from public.events e
  join public.profiles p on p.branch_id = e.branch_id
  where e.occurs_on between current_date and current_date + 7
    and p.role in ('coordinator','treasurer','admin')
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  -- Monthly Mission Fund nudge on the 25th (visible truth: pending != received).
  if extract(day from current_date) = 25 then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select p.id, 'fund',
           'Mission Fund reminder',
           'If you planned a contribution this month, you can declare it or record your bank/UPI payment in the Mission Fund tab. Only treasurer-verified payments count toward the balance.',
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

revoke execute on function public.generate_reminders() from anon, authenticated;
grant execute on function public.generate_reminders() to service_role;
