-- ============================================================================
-- Family roster import — 31 members from the birthday sheet (Oct 2026).
-- Corrected phones applied: Akitoli → 8787438094, Mekua → 8787837993.
--
-- HOW TO RUN: Supabase SQL editor (or `supabase db push` + psql), AFTER
-- migrations 0001–0012 are applied. Requires service-role / postgres rights
-- because it creates auth.users rows directly.
--
-- IDEMPOTENT: every statement is guarded by NOT EXISTS on the normalized
-- phone (unique partial index) or full_name, so re-running never duplicates.
--
-- PASSWORD POLICY HERE: no password is set. Each created login uses a random
-- UUID password; the admin must use "Reset password" on /members/<id> to hand
-- out a real password before the relative's first sign-in (mobile number +
-- password login, per migration 0007).
--
-- The 11 members WITHOUT a mobile number are inserted as DIRECTORY-ONLY
-- profiles (no login; cannot author content until an account is linked):
--   Eshan Vikibe (Ishabo, Ikki) — 28 Aug · Ethan (Ethamu) — 24 Mar
--   Hilomu — 30 Nov · Juni (Junibo) — 25 Jul · Nikupu / Kurpu — 15 Sep 2018
--   Nilimi — 13 May · Nipu — 2 Nov · Sumsa (Sumbo) — 18 Jun
--   Tili (Atili, Tilibo) — 26 Feb · Tonu (Atonu) — 9 Dec · Vibo — 26 Apr 2015
-- Birthdays without a year are stored as birthday_hint ('MM-DD', year-unknown);
-- we never invent a birth year. Branch and role default to NULL/'member' —
-- assign branches from /members after import.
-- ============================================================================

begin;

-- Shared CTE logic is inlined per statement for plain-SQL-editor compatibility.

-- ===== Members WITH a mobile number (auth user + profile) =====
-- 1. Akitoli (Akky) — 31 July
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918787438094@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Akitoli","phone":"918787438094"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918787438094');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Akitoli', array['Akky']::text[], '918787438094', '918787438094', null, null, '2000-07-31', 'member', now(), now()
from auth.users u where u.email = 'OFH-918787438094@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918787438094')
on conflict (id) do nothing;

-- 2. Debu — 4 January
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-916009551002@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Debu","phone":"916009551002"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '916009551002');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Debu', null, '916009551002', '916009551002', null, null, '2000-01-04', 'member', now(), now()
from auth.users u where u.email = 'OFH-916009551002@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '916009551002')
on conflict (id) do nothing;

-- 3. Deepshika Dorothy Roy (Deepshi) — 11 March
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-916009560869@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Deepshika Dorothy Roy","phone":"916009560869"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '916009560869');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Deepshika Dorothy Roy', array['Deepshi']::text[], '916009560869', '916009560869', null, null, '2000-03-11', 'member', now(), now()
from auth.users u where u.email = 'OFH-916009560869@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '916009560869')
on conflict (id) do nothing;

-- 4. Hokato — 2 January
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918798856649@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Hokato","phone":"918798856649"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918798856649');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Hokato', null, '918798856649', '918798856649', null, null, '2000-01-02', 'member', now(), now()
from auth.users u where u.email = 'OFH-918798856649@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918798856649')
on conflict (id) do nothing;

-- 5. Hopeto — 7 September 1984
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918837306849@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Hopeto","phone":"918837306849"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918837306849');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Hopeto', null, '918837306849', '918837306849', '1984-09-07', 1984, null, 'member', now(), now()
from auth.users u where u.email = 'OFH-918837306849@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918837306849')
on conflict (id) do nothing;

-- 6. Inakali (Inaka) — 21 June
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-919366524237@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Inakali","phone":"919366524237"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '919366524237');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Inakali', array['Inaka']::text[], '919366524237', '919366524237', null, null, '2000-06-21', 'member', now(), now()
from auth.users u where u.email = 'OFH-919366524237@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '919366524237')
on conflict (id) do nothing;

-- 7. Kaliho (Kalu, Akansha) — 1 July
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918014121687@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Kaliho","phone":"918014121687"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918014121687');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Kaliho', array['Kalu','Akansha']::text[], '918014121687', '918014121687', null, null, '2000-07-01', 'member', now(), now()
from auth.users u where u.email = 'OFH-918014121687@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918014121687')
on conflict (id) do nothing;

-- 8. Kito — 12 February
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-919366513145@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Kito","phone":"919366513145"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '919366513145');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Kito', null, '919366513145', '919366513145', null, null, '2000-02-12', 'member', now(), now()
from auth.users u where u.email = 'OFH-919366513145@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '919366513145')
on conflict (id) do nothing;

-- 9. Kughato — 3 July
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918974749712@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Kughato","phone":"918974749712"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918974749712');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Kughato', null, '918974749712', '918974749712', null, null, '2000-07-03', 'member', now(), now()
from auth.users u where u.email = 'OFH-918974749712@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918974749712')
on conflict (id) do nothing;

-- 10. Livito (Livi) — 24 May
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918794082366@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Livito","phone":"918794082366"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918794082366');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Livito', array['Livi']::text[], '918794082366', '918794082366', null, null, '2000-05-24', 'member', now(), now()
from auth.users u where u.email = 'OFH-918794082366@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918794082366')
on conflict (id) do nothing;

-- 11. Loinoli — 8 November
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-919366320206@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Loinoli","phone":"919366320206"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '919366320206');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Loinoli', null, '919366320206', '919366320206', null, null, '2000-11-08', 'member', now(), now()
from auth.users u where u.email = 'OFH-919366320206@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '919366320206')
on conflict (id) do nothing;

-- 12. Mary (Mare) — 21 September 1982
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-917005111709@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Mary","phone":"917005111709"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '917005111709');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Mary', array['Mare']::text[], '917005111709', '917005111709', '1982-09-21', 1982, null, 'member', now(), now()
from auth.users u where u.email = 'OFH-917005111709@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '917005111709')
on conflict (id) do nothing;

-- 13. Mekua (Amekua) — 24 October  [corrected phone]
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918787837993@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Mekua","phone":"918787837993"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918787837993');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Mekua', array['Amekua']::text[], '918787837993', '918787837993', null, null, '2000-10-24', 'member', now(), now()
from auth.users u where u.email = 'OFH-918787837993@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918787837993')
on conflict (id) do nothing;

-- 14. Mughatoli (Amugha) — 15 July
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918416060489@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Mughatoli","phone":"918416060489"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918416060489');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Mughatoli', array['Amugha']::text[], '918416060489', '918416060489', null, null, '2000-07-15', 'member', now(), now()
from auth.users u where u.email = 'OFH-918416060489@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918416060489')
on conflict (id) do nothing;

-- 15. Ngukavi — 4 April
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-919862416682@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Ngukavi","phone":"919862416682"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '919862416682');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Ngukavi', null, '919862416682', '919862416682', null, null, '2000-04-04', 'member', now(), now()
from auth.users u where u.email = 'OFH-919862416682@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '919862416682')
on conflict (id) do nothing;

-- 16. Nikali (Anika) — 12 January
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918729877569@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Nikali","phone":"918729877569"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918729877569');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Nikali', array['Anika']::text[], '918729877569', '918729877569', null, null, '2000-01-12', 'member', now(), now()
from auth.users u where u.email = 'OFH-918729877569@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918729877569')
on conflict (id) do nothing;

-- 17. Saurabh — 26 August
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-919818052228@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Saurabh","phone":"919818052228"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '919818052228');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Saurabh', null, '919818052228', '919818052228', null, null, '2000-08-26', 'member', now(), now()
from auth.users u where u.email = 'OFH-919818052228@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '919818052228')
on conflict (id) do nothing;

-- 18. Shikatoli (Shika) — 18 October
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918118992845@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Shikatoli","phone":"918118992845"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918118992845');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Shikatoli', array['Shika']::text[], '918118992845', '918118992845', null, null, '2000-10-18', 'member', now(), now()
from auth.users u where u.email = 'OFH-918118992845@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918118992845')
on conflict (id) do nothing;

-- 19. Tunakali (Tunabo) — 6 March
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-916909806009@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Tunakali","phone":"916909806009"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '916909806009');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Tunakali', array['Tunabo']::text[], '916909806009', '916909806009', null, null, '2000-03-06', 'member', now(), now()
from auth.users u where u.email = 'OFH-916909806009@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '916909806009')
on conflict (id) do nothing;

-- 20. Vikheshe — 15 August
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'OFH-918837270518@phone.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), null, null, null,
  '{"provider":"email","providers":["email"],"role":"member"}', '{"full_name":"Vikheshe","phone":"918837270518"}', now(), now(), false
where not exists (select 1 from public.profiles where phone_normalized = '918837270518');

insert into public.profiles (id, full_name, nicknames, phone, phone_normalized, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select u.id, 'Vikheshe', null, '918837270518', '918837270518', null, null, '2000-08-15', 'member', now(), now()
from auth.users u where u.email = 'OFH-918837270518@phone.invalid'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.phone_normalized = '918837270518')
on conflict (id) do nothing;

-- ===== Members WITHOUT a mobile number (directory-only, no login) =====
insert into public.profiles (id, full_name, nicknames, birth_date, birth_year, birthday_hint, role, created_at, updated_at)
select gen_random_uuid(), r.full_name, r.nicknames, r.birth_date, r.birth_year, r.birthday_hint, 'member', now(), now()
from (values
  ('Eshan Vikibe',        array['Ishabo','Ikki']::text[], null,          null,     '2000-08-28'::date),
  ('Ethan',               array['Ethamu']::text[],        null,          null,     '2000-03-24'::date),
  ('Hilomu',              null,                           null,          null,     '2000-11-30'::date),
  ('Juni',                array['Junibo']::text[],        null,          null,     '2000-07-25'::date),
  ('Nikupu / Kurpu',      null,                           '2018-09-15'::date, 2018, null),
  ('Nilimi',              null,                           null,          null,     '2000-05-13'::date),
  ('Nipu',                null,                           null,          null,     '2000-11-02'::date),
  ('Sumsa',               array['Sumbo']::text[],         null,          null,     '2000-06-18'::date),
  ('Tili',                array['Atili','Tilibo']::text[],null,          null,     '2000-02-26'::date),
  ('Tonu',                array['Atonu']::text[],         null,          null,     '2000-12-09'::date),
  ('Vibo',                null,                           '2015-04-26'::date, 2015, null)
) as r(full_name, nicknames, birth_date, birth_year, birthday_hint)
where not exists (
  select 1 from public.profiles p
  where lower(trim(p.full_name)) = lower(trim(r.full_name))
);

commit;

-- Audit note (append-only log via the SECURITY DEFINER helper from 0001).
-- entity_id is NOT NULL by schema, so we use a batch tag. Logged on every run.
select public.log_audit(
  (select id from public.profiles where role = 'admin' order by created_at limit 1),
  'roster.import_sql', 'profiles', 'birthdays-oct-2026',
  jsonb_build_object('with_phone', 20, 'directory_only', 11,
                     'phone_fixes', jsonb_build_object('Akitoli', '8787438094', 'Mekua', '8787837993'))
);

-- Verification query (run after commit; expect 31 total new rows):
-- select count(*) filter (where phone_normalized is not null)     as with_login,
--        count(*) filter (where phone_normalized is null)         as directory_only,
--        count(*)                                                 as roster_total
--   from public.profiles
--  where full_name in ('Akitoli','Debu','Deepshika Dorothy Roy','Eshan Vikibe','Ethan',
--                       'Hilomu','Hokato','Hopeto','Inakali','Juni','Kaliho','Kito','Kughato',
--                       'Livito','Loinoli','Mary','Mekua','Mughatoli','Ngukavi','Nikali',
--                       'Nikupu / Kurpu','Nilimi','Nipu','Saurabh','Shikatoli','Sumsa','Tili',
--                       'Tonu','Tunakali','Vibo','Vikheshe');
