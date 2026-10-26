-- ============================================================================
-- 0009 — Admin "Add family member" support.
--   * Phone (mobile) is the primary identity for new members created by an
--     admin. A private shadow email (<phone>@phone.invalid, migration 0007)
--     satisfies Supabase's email requirement without exposing a real address.
--   * Adds birthday / anniversary dates used by recurring-event roll-forward.
--   * Tightens profile policies: only admins may INSERT profiles directly;
--     treasurer/admin may update any profile (role guard trigger still applies).
--   * handle_new_user now copies phone + branch from auth metadata so accounts
--     created via the service-role admin API get a complete profile row.
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) New profile fields
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists anniversary_date date;

-- ----------------------------------------------------------------------------
-- 2) Profile RLS: admin-managed creation & editing
-- ----------------------------------------------------------------------------
drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.jwt_role() = 'admin' and id = auth.uid());
  -- In practice profile rows are created by the signup trigger (SECURITY
  -- DEFINER, bypasses RLS). This policy simply refuses client-side inserts
  -- from non-admins; even admins should use the server action.

drop policy if exists profiles_update_treasurer_admin on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

-- Treasurer/admin may edit any profile (guard_profile_change still blocks
-- role changes unless the actor is treasurer/admin, and audits every edit).
create policy profiles_update_manage on public.profiles
  for update to authenticated
  using (public.is_treasurer_or_admin())
  with check (public.is_treasurer_or_admin() or public.jwt_role() = 'member');

-- Members keep editing ONLY their own basic fields (name/phone/dates).
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3) Signup trigger: copy phone + branch from auth metadata
-- ----------------------------------------------------------------------------
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
          nullif(new.raw_user_meta_data ->> 'branch_id', '')::uuid);

  perform public.log_audit(new.id, 'auth.signup', 'profiles', new.id::text,
                           jsonb_build_object('initial_role', v_role,
                                              'created_by_admin',
                                              coalesce(new.raw_user_meta_data ->> 'created_by', 'signup')));
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Shadow-email sync must also run for freshly inserted phone accounts
--    (0007 wired it for updates; inserts arrive with the shadow email already
--     set by the admin action, so nothing extra is needed here.)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5) Keep recurring birthday/anniversary events in sync with profile dates.
--    Trigger-managed so edits from ANY path (admin UI, member self-edit, SQL)
--    stay consistent. Rows are tagged via notes so the trigger owns only its
--    own events and never touches manually scheduled meetups.
-- ----------------------------------------------------------------------------
create or replace function public.sync_recurring_events()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Birthday
  if new.birth_date is not null then
    insert into public.events (kind, title, occurs_on, member_id, notes)
    values ('birthday', new.full_name || ' — Birthday',
            (date_trunc('year', current_date)::date + (extract(month from new.birth_date)-1) * interval '1 month'
             + (extract(day from new.birth_date)::int - 1) * interval '1 day')::date,
            new.id, 'auto:birthday')
    on conflict do nothing;
    update public.events
       set occurs_on = (date_trunc('year', current_date)::date
             + (extract(month from new.birth_date)-1) * interval '1 month'
             + (extract(day from new.birth_date)::int - 1) * interval '1 day')::date,
           title = new.full_name || ' — Birthday'
     where member_id = new.id and kind = 'birthday' and notes = 'auto:birthday';
  else
    delete from public.events where member_id = new.id and kind = 'birthday' and notes = 'auto:birthday';
  end if;

  -- Anniversary
  if new.anniversary_date is not null then
    insert into public.events (kind, title, occurs_on, member_id, notes)
    values ('anniversary', new.full_name || ' — Anniversary',
            (date_trunc('year', current_date)::date + (extract(month from new.anniversary_date)-1) * interval '1 month'
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

drop trigger if exists profiles_sync_recurring on public.profiles;
create trigger profiles_sync_recurring
  after insert or update of birth_date, anniversary_date, full_name on public.profiles
  for each row execute function public.sync_recurring_events();

-- [hws fix] trigger functions are not client-callable (0009 lockdown).
revoke execute on function public.sync_recurring_events() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
