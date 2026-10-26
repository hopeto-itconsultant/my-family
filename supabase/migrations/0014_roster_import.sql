-- ============================================================================
-- Migration 0012 — Roster import support (bulk family-member entry)
-- ----------------------------------------------------------------------------
-- Supports the admin "Import roster" screen fed by a spreadsheet with columns
--   Birthday | Name | Nicknames-Petnames | ContactNo
--
-- Decisions encoded here (data-integrity rules):
--   * Members WITHOUT a valid 10-digit mobile are imported as DIRECTORY-ONLY
--     rows (full_name + nicknames + birthday). They have no login and cannot
--     author anything (no auth.users row -> all authorship FKs reject them).
--     A later "Link account" step creates their auth user with the SAME uuid,
--     promoting them to a full member without losing history.
--   * Birthdays given without a year ("31 July") are stored in a new
--     birthday_hint date (year = 2000 sentinel, display day+month only).
--     We never invent a birth year.
--   * Import runs under the service-role key (bypasses RLS); every batch is
--     written to the append-only audit_log by the Server Action.
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

-- 0) profiles.id previously had to exist in auth.users. Allow directory-only
--    relatives (no login yet). Authorship FKs on other tables still point at
--    profiles(id), so those rows remain valid; content creation is blocked for
--    them anyway because they can never obtain a session/JWT.
--    (The constraint is declared inline in 0001, so Postgres names it
--     profiles_id_fkey; we drop it by its actual name for safety.)
do $$
declare cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and contype = 'f'
     and confrelid = 'auth.users'::regclass;
  if cname is not null then
    execute format('alter table public.profiles drop constraint %I', cname);
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role public.family_role;
begin
  select case when count(*) = 0 then 'admin'::public.family_role
              else 'member'::public.family_role end
    into v_role from public.profiles;

  insert into public.profiles (id, full_name, role, phone, branch_id)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'full_name', 'New member'),
          v_role,
          public.normalize_phone(new.raw_user_meta_data ->> 'phone'),
          nullif(new.raw_user_meta_data ->> 'branch_id', '')::uuid)
  on conflict (id) do nothing;   -- directory-only row exists: "link account" keeps it

  perform public.log_audit(new.id, 'auth.signup', 'profiles', new.id::text,
                           jsonb_build_object('initial_role', v_role,
                                              'created_by_admin',
                                              coalesce(new.raw_user_meta_data ->> 'created_by', 'signup')));
  return new;
end $$;

-- 1) Day+month known, year unknown -> placeholder date (year 2000 sentinel).
alter table public.profiles add column if not exists birthday_hint date;

comment on column public.profiles.birthday_hint is
  'Day+month of birth when the year is unknown; year part is always 2000 (sentinel). Never displayed as a full date.';

-- Guard: hint must use the sentinel year, so nothing mistakes it for a real date.
alter table public.profiles drop constraint if exists profiles_birthday_hint_sentinel;
alter table public.profiles add constraint profiles_birthday_hint_sentinel
  check (birthday_hint is null or extract(year from birthday_hint) = 2000);

-- 2) The trigger added in 0010 must now also fire when birthday_hint changes.
drop trigger if exists profiles_normalize_dates on public.profiles;
create trigger profiles_normalize_dates
  before insert or update of nicknames, birth_date, birth_year, date_of_death, birthday_hint
  on public.profiles
  for each row execute function public.normalize_member_dates();

-- 3) If a full birth_date later arrives, drop the redundant hint.
create or replace function public.clear_birthday_hint()
returns trigger
language plpgsql as $$
begin
  if new.birth_date is not null then
    new.birthday_hint := null;
  end if;
  return new;
end $$;

drop trigger if exists profiles_clear_birthday_hint on public.profiles;
create trigger profiles_clear_birthday_hint
  before insert or update of birth_date, birthday_hint
  on public.profiles
  for each row execute function public.clear_birthday_hint();

-- [hws fix] auto-event trigger must also fire when birthday_hint changes on UPDATE
drop trigger if exists profiles_sync_recurring on public.profiles;
create trigger profiles_sync_recurring
  after insert or update of birth_date, birthday_hint, anniversary_date, full_name
  on public.profiles
  for each row execute function public.sync_recurring_events();

-- [hws fix] keep trigger functions off the RPC surface (0009 lockdown)
alter function public.clear_birthday_hint() set search_path = public;
revoke execute on function public.clear_birthday_hint() from public, anon, authenticated;

-- 4) Robust auto-event sync:
--    * dedupe (member, kind, notes-tag) via a partial unique index so the
--      insert-if-absent pattern is race-free (events.id has no default, so
--      "on conflict (id)" used previously would throw, not skip);
--    * Feb-29 hints/dates roll to Feb-28 in non-leap years instead of failing.
create unique index if not exists events_auto_member_kind_key
  on public.events (member_id, kind, notes)
  where member_id is not null and notes like 'auto:%';

create or replace function public.sync_recurring_events()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b_month int;
  b_day   int;
  target  date;
begin
  if new.birth_date is not null then
    b_month := extract(month from new.birth_date)::int;
    b_day   := extract(day   from new.birth_date)::int;
  elsif new.birthday_hint is not null then
    b_month := extract(month from new.birthday_hint)::int;
    b_day   := extract(day   from new.birthday_hint)::int;
  else
    b_month := null; b_day := null;
  end if;

  -- Birthday
  if b_month is not null then
    target := (date_trunc('year', current_date)::date
               + (b_month - 1) * interval '1 month'
               + (b_day - 1) * interval '1 day')::date;
    if b_month = 2 and b_day = 29
       and extract(year from target)::int % 4 <> 0 then
      target := target - 1;  -- Feb 28 in non-leap years
    end if;

    insert into public.events (kind, title, occurs_on, member_id, notes)
    values ('birthday', new.full_name || ' — Birthday', target, new.id, 'auto:birthday')
    on conflict (member_id, kind, notes)
      where member_id is not null and notes like 'auto:%'
    do update set occurs_on = excluded.occurs_on,
                  title     = excluded.title;
  else
    delete from public.events where member_id = new.id and kind = 'birthday' and notes = 'auto:birthday';
  end if;

  -- Anniversary (same leap-day guard)
  if new.anniversary_date is not null then
    target := (date_trunc('year', current_date)::date
               + (extract(month from new.anniversary_date) - 1) * interval '1 month'
               + (extract(day from new.anniversary_date)::int - 1) * interval '1 day')::date;
    if extract(month from new.anniversary_date) = 2 and extract(day from new.anniversary_date) = 29
       and extract(year from target)::int % 4 <> 0 then
      target := target - 1;
    end if;

    insert into public.events (kind, title, occurs_on, member_id, notes)
    values ('anniversary', new.full_name || ' — Anniversary', target, new.id, 'auto:anniversary')
    on conflict (member_id, kind, notes)
      where member_id is not null and notes like 'auto:%'
    do update set occurs_on = excluded.occurs_on,
                  title     = excluded.title;
  else
    delete from public.events where member_id = new.id and kind = 'anniversary' and notes = 'auto:anniversary';
  end if;

  return new;
end $$;

-- [hws fix] re-assert 0009 lockdown on the re-created functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_recurring_events() from public, anon, authenticated;
