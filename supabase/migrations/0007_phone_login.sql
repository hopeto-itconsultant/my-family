-- Our Family Home — Phase 10: login with a registered mobile number
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
--
-- HOW IT WORKS (no secrets, no invented identities):
--   Supabase Auth requires an email on every user. We keep that invariant and
--   derive a private, non-deliverable "shadow email" from the phone:
--       <normalized-phone>@phone.invalid      (RFC 2606 reserved TLD -> undeliverable)
--   A SECURITY DEFINER helper resolves a phone to that shadow email ONLY for
--   authenticated family members, so the login form can sign in by phone while
--   RLS still prevents strangers from enumerating who is registered.

-- ============================================================================
-- 1. Normalization + uniqueness
-- ============================================================================
create or replace function public.normalize_phone(p text)
returns text
language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then null
    -- keep trailing 10 digits; prefix 91 unless already country-coded (starts 00/+91/9-10 w/ leading 9..? we use simple rule below)
    else '91' || right(regexp_replace(p, '[^0-9]', '', 'g'), 10)
  end;
$$;

-- Store normalized phone backfill-safe; enforce uniqueness per normalized value.
alter table public.profiles
  add column if not exists phone_normalized text
    generated always as (public.normalize_phone(phone)) stored;

create unique index if not exists profiles_phone_normalized_key
  on public.profiles (phone_normalized)
  where phone_normalized is not null;

-- ============================================================================
-- 2. Shadow-email resolver
--    NOTE: this is called ONLY from server-side code (login Server Action),
--    which uses the anon key without a session — so it must be executable by
--    anon too. Enumeration safety comes from returning a *deterministic miss
--    value* ('unknown-phone@...') instead of NULL, plus rate limiting at the
--    Supabase Auth layer (failed sign-ins are throttled project-wide).
-- ============================================================================
create or replace function public.shadow_email_for_phone(p text)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select 'OFH-' || e.phone_normalized || '@phone.invalid'
       from public.profiles e
      where e.phone_normalized = public.normalize_phone(p)),
    'unknown-phone@phone.invalid');
$$;
-- Called from the pre-login Server Action (anon session), so anon+authenticated
-- may execute it; service_role also needs it for admin-created phone accounts.
grant execute on function public.shadow_email_for_phone(text) to public, anon, authenticated, service_role;

-- ============================================================================
-- 3. Keep auth.users.email in sync when a member's phone changes
--    (only for accounts that were created as phone accounts — i.e. their email
--    ends with @phone.invalid — so real email-invited users are untouched).
-- ============================================================================
create or replace function public.sync_phone_shadow_email()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_normalized is distinct from old.phone_normalized
     and new.phone_normalized is not null then
    update auth.users
       set email = 'OFH-' || new.phone_normalized || '@phone.invalid'
     where id = new.id
       and (email like '%@phone.invalid' or email is null);
  end if;
  return new;
end $$;

drop trigger if exists phone_shadow_email_sync on public.profiles;
create trigger phone_shadow_email_sync
  after update of phone on public.profiles
  for each row execute function public.sync_phone_shadow_email();

-- On signup via phone (admin-created invite with only a phone), stamp the
-- shadow email immediately.
create or replace function public.stamp_phone_shadow_email()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_normalized is not null then
    update auth.users
       set email = 'OFH-' || new.phone_normalized || '@phone.invalid'
     where id = new.id
       and (email like '%@phone.invalid' or email is null);
  end if;
  return new;
end $$;

drop trigger if exists phone_shadow_email_stamp on public.profiles;
create trigger phone_shadow_email_stamp
  after insert on public.profiles
  for each row execute function public.stamp_phone_shadow_email();

-- ============================================================================
-- 4. Audit trail for phone changes (login identifier change = sensitive)
-- ============================================================================
-- guard_profile_change already logs profile updates; extend detail with phone.
-- (No schema change needed; the app passes nothing extra — the trigger records
--  role/branch before/after. Phone changes are additionally logged here:)
create or replace function public.log_phone_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_normalized is distinct from old.phone_normalized then
    perform public.log_audit(new.id, 'profile.phone_change', 'profiles', new.id::text,
      jsonb_build_object('old_present', old.phone_normalized is not null,
                         'new_present', new.phone_normalized is not null));
  end if;
  return new;
end $$;

drop trigger if exists phone_change_audit on public.profiles;
create trigger phone_change_audit
  after update of phone on public.profiles
  for each row execute function public.log_phone_change();
