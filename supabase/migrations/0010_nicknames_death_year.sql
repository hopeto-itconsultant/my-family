-- ============================================================================
-- Migration 0010 — Nicknames/petnames, date of death, separate birth year
-- ----------------------------------------------------------------------------
-- Requirements:
--   * nicknames: multiple values entered comma-separated in the UI; stored as
--     a normalized text[] (trimmed, lower-cased, deduplicated).
--   * date_of_death: optional full date.
--   * birth_year: recorded separately in the UI and stored in its own integer
--     column. When the full birth_date is also known, a trigger keeps
--     birth_year consistent with it (so the two can never disagree); when only
--     the year is remembered (elders), birth_date stays NULL and birth_year
--     still drives age display and birthday-event month/day defaults.
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) New profile columns
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists nicknames    text[];
alter table public.profiles add column if not exists birth_year   int
  check (birth_year is null or (birth_year >= 1850 and birth_year <= 2200));
alter table public.profiles add column if not exists date_of_death date
  check (date_of_death is null or date_of_death >= '1900-01-01'::date);

create index if not exists profiles_nicknames_gin
  on public.profiles using gin (nicknames);

-- ----------------------------------------------------------------------------
-- 2) Normalize + cross-validate dates/years BEFORE any other trigger runs.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_member_dates()
returns trigger
language plpgsql
as $$
begin
  -- Trim / lowercase / dedupe nicknames; empty array -> NULL.
  if new.nicknames is not null then
    select coalesce(
             array_agg(distinct lower(trim(x)) order by lower(trim(x))),
             '{}'::text[]
           )
      into new.nicknames
      from unnest(new.nicknames) as x
      where trim(x) <> '';
    if array_length(new.nicknames, 1) is null then
      new.nicknames := null;
    end if;
  end if;

  if new.birth_date is not null then
    -- Full date wins: birth_year must match it (silently corrected).
    new.birth_year := extract(year from new.birth_date)::int;
  elsif new.birth_year is not null and old.birth_date is not null
        and extract(year from old.birth_date)::int <> new.birth_year then
    raise exception 'Birth year (%) disagrees with the recorded birth date.', new.birth_year;
  end if;

  if new.date_of_death is not null and new.birth_date is not null
     and new.date_of_death < new.birth_date then
    raise exception 'Date of death cannot be before the date of birth.';
  end if;
  if new.date_of_death is not null and new.birth_year is not null
     and extract(year from new.date_of_death)::int < new.birth_year then
    raise exception 'Date of death cannot be before the birth year.';
  end if;

  return new;
end $$;

drop trigger if exists profiles_normalize_dates on public.profiles;
create trigger profiles_normalize_dates
  before insert or update of nicknames, birth_date, birth_year, date_of_death
  on public.profiles
  for each row execute function public.normalize_member_dates();

-- ----------------------------------------------------------------------------
-- 3) Birthday events: default to Jun-01 when only the year is known, so a
--    placeholder reminder appears; admins/coordinators can adjust the date.
-- ----------------------------------------------------------------------------
create or replace function public.sync_recurring_events()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b_month int;
  b_day   int;
begin
  if new.birth_date is not null then
    b_month := extract(month from new.birth_date)::int;
    b_day   := extract(day   from new.birth_date)::int;
  elsif new.birth_year is not null then
    b_month := 6; b_day := 1;              -- year-only: neutral placeholder
  else
    b_month := null; b_day := null;
  end if;

  -- Birthday
  if b_month is not null then
    insert into public.events (kind, title, occurs_on, member_id, notes)
    values ('birthday', new.full_name || ' — Birthday',
            (date_trunc('year', current_date)::date + (b_month - 1) * interval '1 month'
             + (b_day - 1) * interval '1 day')::date,
            new.id, 'auto:birthday')
    on conflict do nothing;
    update public.events
       set occurs_on = (date_trunc('year', current_date)::date
             + (b_month - 1) * interval '1 month'
             + (b_day - 1) * interval '1 day')::date,
           title = new.full_name || ' — Birthday'
     where member_id = new.id and kind = 'birthday' and notes = 'auto:birthday';
  else
    delete from public.events where member_id = new.id and kind = 'birthday' and notes = 'auto:birthday';
  end if;

  -- Anniversary (unchanged behaviour)
  if new.anniversary_date is not null then
    insert into public.events (kind, title, occurs_on, member_id, notes)
    values ('anniversary', new.full_name || ' — Anniversary',
            (date_trunc('year', current_date)::date
             + (extract(month from new.anniversary_date)-1) * interval '1 month'
             + (extract(day from new.anniversary_date)::int - 1) * interval '1 day')::date,
            new.id, 'auto:anniversary')
    on conflict do nothing;
    update public.events
       set occurs_on = (date_trunc('year', current_date)::date
             + (extract(month from new.anniversary_date)-1) * interval '1 month'
             + (extract(day from new.anniversary_date)::int - 1) * interval '1 day')::date,
           title = new.full_name || ' — Anniversary'
     where member_id = new.id and kind = 'anniversary' and notes = 'auto:anniversary';
  else
    delete from public.events where member_id = new.id and kind = 'anniversary' and notes = 'auto:anniversary';
  end if;

  return new;
end $$;
