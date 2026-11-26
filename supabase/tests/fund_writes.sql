-- ============================================================================
-- Mission Fund write gate (migration 0017).
-- Run from anywhere with psql against a database that already has migrations
-- 0001..0017 applied (local Postgres is enough; this does not touch production):
--
--   psql "postgres://postgres@127.0.0.1/familytest" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/fund_writes.sql
--
-- Re-applies 0017 inside a transaction, checks a pre-existing contribution is
-- untouched, then acts as admin, treasurer, and plain member. Every failure
-- RAISEs. Success prints 'FUND WRITE TESTS PASSED'. The transaction rolls back.
-- ============================================================================
begin;

-- Empty token strings and an email identity so these rows are valid GoTrue
-- users (NULL confirmation_token / a missing identities row breaks password login).
insert into auth.users (
  id, email, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values
  ('11111111-1111-4111-8111-111111111111', 'fund-admin@test.invalid', '{"full_name":"Fund Admin"}', '', '', '', '', '', '', '', ''),
  ('22222222-2222-4222-8222-222222222222', 'fund-treasurer@test.invalid', '{"full_name":"Fund Treasurer"}', '', '', '', '', '', '', '', ''),
  ('33333333-3333-4333-8333-333333333333', 'fund-member@test.invalid', '{"full_name":"Fund Member"}', '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', u.id::text, now(), now()
  from auth.users u
 where u.email in (
   'fund-admin@test.invalid',
   'fund-treasurer@test.invalid',
   'fund-member@test.invalid'
 );

-- Signup trigger made the first user admin and the others members.
-- The role-change trigger requires a treasurer/admin JWT (or, after 0017, no
-- auth.uid() at all). Set an admin claim before promoting the treasurer.
select set_config('request.jwt.claims',
  json_build_object('sub','11111111-1111-4111-8111-111111111111','role','authenticated',
    'app_metadata', json_build_object('role','admin'))::text, true);
update public.profiles set role = 'treasurer'
 where id = '22222222-2222-4222-8222-222222222222';

-- A unit-level treasurer who is still a global member must NOT gain fund writes.
insert into public.org_units (id, kind, name, scope)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'group', 'Fund Test Circle', 'branch');
insert into public.unit_memberships (unit_id, member_id, member_role, status, grant_reason)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        '33333333-3333-4333-8333-333333333333', 'treasurer', 'active', 'test fixture');

-- Row that stands in for fund data recorded before this migration.
insert into public.contributions (id, member_id, amount_paise, month_ref, method, status, note)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        '33333333-3333-4333-8333-333333333333',
        4242, '2020-01', 'cash', 'pending_verification', 'pre-existing');

\ir ../migrations/0017_fund_writes_treasurer_and_admin.sql

do $$
declare row public.contributions;
begin
  select * into row from public.contributions
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if row.id is null or row.amount_paise <> 4242 or row.note <> 'pre-existing'
     or row.status <> 'pending_verification' then
    raise exception 're-applying 0017 changed an existing contribution';
  end if;
  raise notice 'existing contribution survived re-applying 0017';
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.contributions, public.expenses, public.profiles to authenticated;

-- ---- plain member: read yes, write no (even with a unit treasurer badge) ----
select set_config('request.jwt.claims',
  json_build_object('sub','33333333-3333-4333-8333-333333333333','role','authenticated',
    'app_metadata', json_build_object('role','member'))::text, true);
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.contributions
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if n <> 1 then raise exception 'member cannot read an existing contribution'; end if;

  update public.contributions set note = 'hacked'
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'member updated a contribution'; end if;

  delete from public.contributions where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'member deleted a contribution'; end if;

  if (select note from public.contributions where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
       is distinct from 'pre-existing' then
    raise exception 'member rewrote an existing contribution';
  end if;
  raise notice 'member can read and cannot update or delete';
end $$;

do $$
begin
  begin
    insert into public.contributions (member_id, amount_paise, method, status)
    values ('33333333-3333-4333-8333-333333333333', 100, 'cash', 'pending_verification');
    raise exception 'MEMBER INSERT SUCCEEDED';
  exception when others then
    if sqlerrm like '%MEMBER INSERT SUCCEEDED%' then
      raise exception 'member insert was not blocked by RLS';
    end if;
    if sqlerrm not like '%row-level security%' then
      raise exception 'member insert failed for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'member insert blocked: %', sqlerrm;
  end;

  begin
    perform public.record_contribution_as_treasurer(
      '33333333-3333-4333-8333-333333333333', 500, '2026-01', 'cash', 'nope');
    raise exception 'MEMBER RPC SUCCEEDED';
  exception when others then
    if sqlerrm like '%MEMBER RPC SUCCEEDED%' then
      raise exception 'member rpc was not blocked';
    end if;
    if sqlerrm not ilike '%treasurer or an admin%' then
      raise exception 'member rpc failed unexpectedly: %', sqlerrm;
    end if;
    raise notice 'member rpc blocked: %', sqlerrm;
  end;
end $$;

-- Legacy coordinator claim is not a fund writer.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub','33333333-3333-4333-8333-333333333333','role','authenticated',
    'app_metadata', json_build_object('role','coordinator'))::text, true);
set local role authenticated;

do $$
begin
  begin
    insert into public.expenses (title, amount_paise, requested_by)
    values ('Sneaky', 100, '33333333-3333-4333-8333-333333333333');
    raise exception 'COORDINATOR INSERT SUCCEEDED';
  exception when others then
    if sqlerrm like '%COORDINATOR INSERT SUCCEEDED%' then
      raise exception 'coordinator insert was not blocked';
    end if;
    if sqlerrm not like '%row-level security%' then
      raise exception 'coordinator insert failed unexpectedly: %', sqlerrm;
    end if;
    raise notice 'coordinator insert blocked';
  end;
end $$;

-- ---- treasurer: direct insert, edit, delete, and audited transitions -------
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub','22222222-2222-4222-8222-222222222222','role','authenticated',
    'app_metadata', json_build_object('role','treasurer'))::text, true);
set local role authenticated;

do $$
declare new_id uuid;
begin
  begin
    insert into public.contributions (member_id, amount_paise, method, status)
    values ('33333333-3333-4333-8333-333333333333', 50, 'cash', 'verified');
    raise exception 'VERIFIED INSERT SUCCEEDED';
  exception when others then
    if sqlerrm like '%VERIFIED INSERT SUCCEEDED%' then
      raise exception 'direct insert of an already-verified contribution was allowed';
    end if;
    if sqlerrm not like '%row-level security%' and sqlerrm not like '%verified_shape%' then
      raise exception 'verified insert failed unexpectedly: %', sqlerrm;
    end if;
  end;

  insert into public.contributions (member_id, amount_paise, month_ref, method, status, note)
  values ('33333333-3333-4333-8333-333333333333', 8800, '2026-02', 'upi_online',
          'pending_verification', 'treasurer direct')
  returning id into new_id;
  update public.contributions set note = 'treasurer edited' where id = new_id;
  if not found then raise exception 'treasurer update blocked'; end if;
  delete from public.contributions where id = new_id;
  if not found then raise exception 'treasurer delete blocked'; end if;

  new_id := public.record_contribution_as_treasurer(
    '33333333-3333-4333-8333-333333333333', 9100, '2026-03', 'cash', 'via rpc');
  perform public.verify_contribution(new_id, 'CASH voucher 12');
  if (select status from public.contributions where id = new_id) <> 'verified' then
    raise exception 'treasurer verify failed';
  end if;
  perform public.reverse_contribution(new_id, 'entered twice by mistake');
  if (select status from public.contributions where id = new_id) <> 'reversed' then
    raise exception 'treasurer reverse failed';
  end if;
  raise notice 'treasurer insert, update, delete, verify, and reverse ok';
end $$;

-- ---- admin: same write path, including an expense transition ----------------
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub','11111111-1111-4111-8111-111111111111','role','authenticated',
    'app_metadata', json_build_object('role','admin'))::text, true);
set local role authenticated;

do $$
declare exp_id uuid;
declare contrib_id uuid;
begin
  contrib_id := public.record_contribution_as_treasurer(
    '33333333-3333-4333-8333-333333333333', 7700, '2026-04', 'upi_online', 'admin entry');
  if contrib_id is null then raise exception 'admin could not record a contribution'; end if;
  delete from public.contributions where id = contrib_id;
  if not found then raise exception 'admin delete of a contribution blocked'; end if;

  insert into public.expenses (title, amount_paise, requested_by, status)
  values ('Hall booking', 150000, '11111111-1111-4111-8111-111111111111', 'submitted')
  returning id into exp_id;
  perform public.approve_expense(exp_id);
  if (select status from public.expenses where id = exp_id) <> 'approved' then
    raise exception 'admin approve failed';
  end if;
  update public.expenses set purpose = 'family meet' where id = exp_id;
  if not found then raise exception 'admin expense update blocked'; end if;
  delete from public.expenses where id = exp_id;
  if not found then raise exception 'admin expense delete blocked'; end if;
  raise notice 'admin record, approve, update, and delete ok';
end $$;

-- Member still cannot drive an expense transition the admin created... already deleted.
-- Confirm the historical row is still the original one.
do $$
begin
  if (select amount_paise from public.contributions
       where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') <> 4242 then
    raise exception 'fund tests rewrote the pre-existing contribution';
  end if;
end $$;

-- Stale JWT must not win. A treasurer token whose profile was set back to
-- member cannot write. A member token whose profile is treasurer can.
reset role;
update public.profiles set role = 'member'
 where id = '22222222-2222-4222-8222-222222222222';
select set_config('request.jwt.claims',
  json_build_object('sub','22222222-2222-4222-8222-222222222222','role','authenticated',
    'app_metadata', json_build_object('role','treasurer'))::text, true);
set local role authenticated;

do $$
begin
  begin
    insert into public.contributions (member_id, amount_paise, method, status)
    values ('33333333-3333-4333-8333-333333333333', 61, 'cash', 'pending_verification');
    raise exception 'STALE TREASURER JWT INSERT SUCCEEDED';
  exception when others then
    if sqlerrm like '%STALE TREASURER JWT INSERT SUCCEEDED%' then
      raise exception 'a demoted treasurer with an old token could still insert';
    end if;
    if sqlerrm not like '%row-level security%' then
      raise exception 'demoted treasurer failed unexpectedly: %', sqlerrm;
    end if;
    raise notice 'demoted treasurer blocked even with a treasurer token';
  end;
end $$;

reset role;
update public.profiles set role = 'treasurer'
 where id = '22222222-2222-4222-8222-222222222222';
select set_config('request.jwt.claims',
  json_build_object('sub','22222222-2222-4222-8222-222222222222','role','authenticated',
    'app_metadata', json_build_object('role','member'))::text, true);
set local role authenticated;

do $$
declare new_id uuid;
begin
  insert into public.contributions (member_id, amount_paise, method, status, note)
  values ('33333333-3333-4333-8333-333333333333', 62, 'cash', 'pending_verification', 'fresh assignment')
  returning id into new_id;
  if new_id is null then raise exception 'newly assigned treasurer was blocked by a stale member token'; end if;
  delete from public.contributions where id = new_id;
  raise notice 'newly assigned treasurer can write before the token refreshes';
end $$;

-- ---- assigning treasurer: admin and service role yes, member no ------------
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub','11111111-1111-4111-8111-111111111111','role','authenticated',
    'app_metadata', json_build_object('role','admin'))::text, true);
set local role authenticated;

do $$
begin
  update public.profiles set role = 'treasurer'
   where id = '33333333-3333-4333-8333-333333333333';
  if (select role from public.profiles where id = '33333333-3333-4333-8333-333333333333')
       <> 'treasurer' then
    raise exception 'admin could not assign treasurer';
  end if;
  update public.profiles set role = 'member'
   where id = '33333333-3333-4333-8333-333333333333';
  if (select role from public.profiles where id = '33333333-3333-4333-8333-333333333333')
       <> 'member' then
    raise exception 'admin could not unassign treasurer';
  end if;
  raise notice 'admin assign and unassign treasurer ok';
end $$;

reset role;
select set_config('request.jwt.claims', '{}', true); -- no auth.uid(): service role

do $$
begin
  update public.profiles set role = 'treasurer'
   where id = '33333333-3333-4333-8333-333333333333';
  if (select role from public.profiles where id = '33333333-3333-4333-8333-333333333333')
       <> 'treasurer' then
    raise exception 'service role could not assign treasurer while creating a member';
  end if;
  update public.profiles set role = 'member'
   where id = '33333333-3333-4333-8333-333333333333';
  raise notice 'service-role role assignment ok';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub','33333333-3333-4333-8333-333333333333','role','authenticated',
    'app_metadata', json_build_object('role','member'))::text, true);
set local role authenticated;

do $$
begin
  begin
    update public.profiles set role = 'treasurer'
     where id = '33333333-3333-4333-8333-333333333333';
    raise exception 'MEMBER ROLE CHANGE SUCCEEDED';
  exception when others then
    if sqlerrm like '%MEMBER ROLE CHANGE SUCCEEDED%' then
      raise exception 'a plain member changed their own role';
    end if;
    if sqlerrm not ilike '%Only treasurers/admins%' then
      raise exception 'member role change failed unexpectedly: %', sqlerrm;
    end if;
    raise notice 'member cannot assign themselves treasurer';
  end;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.contributions
       where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and amount_paise = 4242) <> 1 then
    raise exception 'pre-existing contribution missing at the end';
  end if;
end $$;

select 'FUND WRITE TESTS PASSED' as result;
rollback;
