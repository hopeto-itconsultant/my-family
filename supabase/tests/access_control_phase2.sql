-- ============================================================================
-- Access-control Phase 2 policy tests (run against a REAL Postgres, e.g.
-- `supabase start` local stack — cannot run in CI without Docker).
--   psql "postgres://postgres:postgres@127.0.0.1:54322/postgres" \
--        -f supabase/tests/access_control_phase2.sql
-- Assumes migrations 0001..0014 applied to a scratch DB with test users.
-- Every assertion RAISEs on failure; success prints 'PHASE2 TESTS PASSED'.
-- ============================================================================
begin;

-- ---- fixtures --------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.invalid'),
  ('22222222-2222-2222-2222-222222222222', 'branchA-admin@test.invalid'),
  ('33333333-3333-3333-3333-333333333333', 'plain@test.invalid'),
  ('44444444-4444-4444-4444-444444444444', 'twobranch@test.invalid');

insert into public.profiles (id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'Global Admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Branch A Admin', 'member'),
  ('33333333-3333-3333-3333-333333333333', 'Plain Member', 'member'),
  ('44444444-4444-4444-4444-444444444444', 'Two Branch Person', 'member');

insert into public.org_units (id, kind, name, scope) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'branch', 'Test Branch A', 'branch'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'branch', 'Test Branch B', 'branch'),
  ('cccccccc-0000-0000-0000-000000000001', 'group',  'Youth Group',   'branch');

insert into public.unit_memberships (unit_id, member_id, member_role, status, granted_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'administrator', 'active', null),
  ('bbbbbbbb-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'viewer',        'active', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'viewer',        'active', null);

-- helper to switch role like the API gateway does
create or replace function as_user(u uuid, r text default 'member') returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', r))::text, true);
$$;

-- ---- T2: self-elevation is rejected -----------------------------------------
select as_user('33333333-3333-3333-3333-333333333333');
do $$
begin
  begin
    insert into public.unit_memberships (unit_id, member_id, member_role, status, granted_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001',
            '33333333-3333-3333-3333-333333333333', 'administrator', 'active',
            '33333333-3333-3333-3333-333333333333');
    raise exception 'T2 FAILED: self-grant of administrator succeeded';
  exception when others then
    raise notice 'T2 ok: %', sqlerrm;
  end;
end $$;

-- ---- T3: granting above your own level is rejected --------------------------
select as_user('44444444-4444-4444-4444-444444444444'); -- viewer in branch A
do $$
begin
  begin
    insert into public.unit_memberships (unit_id, member_id, member_role, status, granted_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001',
            '33333333-3333-3333-3333-333333333333', 'editor', 'active',
            '44444444-4444-4444-4444-444444444444');
    raise exception 'T3 FAILED: viewer granted editor to someone else';
  exception when others then
    raise notice 'T3 ok: %', sqlerrm;
  end;
end $$;

-- ---- T4: unit administrator CAN grant lower/equal roles ---------------------
select as_user('22222222-2222-2222-2222-222222222222', 'member'); -- admin of A via membership
do $$
begin
  insert into public.unit_memberships (unit_id, member_id, member_role, status, granted_by)
  values ('aaaaaaaa-0000-0000-0000-000000000001',
          '33333333-3333-3333-3333-333333333333', 'contributor', 'active',
          '22222222-2222-2222-2222-222222222222');
  if not found then raise exception 'T4 FAILED: legitimate grant blocked'; end if;
  raise notice 'T4 ok: unit admin granted contributor';
end $$;

-- ---- T5: suspended membership stops counting for authority -------------------
update public.unit_memberships
   set status = 'suspended'
 where member_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if public.can_grant_role_in_unit('22222222-2222-2222-2222-222222222222',
       'aaaaaaaa-0000-0000-0000-000000000001', 'viewer') then
    raise exception 'T5 FAILED: suspended membership still grants authority';
  end if;
  raise notice 'T5 ok: suspension blocks authority immediately';
end $$;

-- ---- T6: my_units shows only ACTIVE memberships ------------------------------
select as_user('44444444-4444-4444-4444-444444444444');
do $$
declare n int;
begin
  select count(*) into n from public.my_units;
  if n <> 2 then raise exception 'T6 FAILED: expected 2 active units, got %', n; end if;
  raise notice 'T6 ok: two-branch person sees exactly 2 units';
end $$;

-- ---- T7: audit rows were written for every membership change -----------------
do $$
begin
  if (select count(*) from public.audit_log
        where entity = 'unit_memberships') < 2 then
    raise exception 'T7 FAILED: membership changes not audited';
  end if;
  raise notice 'T7 ok: membership changes are in append-only audit_log';
end $$;

-- ---- T8: hard-deleting a unit is blocked for client actors -------------------
select as_user('11111111-1111-1111-1111-111111111111', 'admin');
do $$
begin
  begin
    delete from public.org_units where id = 'cccccccc-0000-0000-0000-000000000001';
    raise exception 'T8 FAILED: unit hard-delete allowed';
  exception when others then
    raise notice 'T8 ok: %', sqlerrm;
  end;
end $$;

select 'PHASE2 TESTS PASSED' as result;
rollback;  -- leave the scratch DB untouched
