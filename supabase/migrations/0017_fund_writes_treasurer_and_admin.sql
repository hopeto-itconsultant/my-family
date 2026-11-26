-- ============================================================================
-- 0017 — Mission Fund writes: treasurer OR admin. Everyone else is view-only.
--
-- The treasurer role already exists (`profiles.role`, copied into the JWT
-- app_metadata.role by custom_access_token_hook). Admins assign or remove it
-- from the member screen. This migration does not add a role, does not
-- rewrite contribution or expense rows, and leaves the family-wide SELECT
-- policies (contrib_read, expense_read) in place.
--
-- Direct Data API calls are gated by the policies below. The audited
-- transition functions bypass RLS (SECURITY DEFINER) and re-check
-- can_write_fund() themselves, so a plain member cannot use them either.
-- A unit_memberships.member_role of 'treasurer' does NOT grant fund writes;
-- only the global profile role does.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) One predicate for fund writes. is_treasurer() has meant treasurer|admin
--    since 0004; keep that, and point it at this function so the two cannot
--    drift.
--    Reads profiles.role for auth.uid(), not the JWT. The access-token hook
--    copies the role into app_metadata only when a new token is issued, so a
--    JWT check would let a removed treasurer keep writing, and would refuse a
--    newly assigned treasurer, until they sign in again. profiles.role is the
--    value the member screen saves. Never user_metadata.
-- ----------------------------------------------------------------------------
create or replace function public.can_write_fund()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles
     where id = (select auth.uid())
       and role in ('treasurer', 'admin')
  );
$$;

revoke execute on function public.can_write_fund() from public, anon;
grant execute on function public.can_write_fund() to authenticated;

comment on function public.can_write_fund() is
  'True when the signed-in profile role is treasurer or admin. Mission Fund writes use this; other signed-in members are view-only. Uses profiles.role so an admin assignment applies before the next token refresh.';

create or replace function public.is_treasurer()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.can_write_fund();
$$;

-- ----------------------------------------------------------------------------
-- 2) Contributions. SELECT policy contrib_read (authenticated, using true)
--    is intentionally not dropped. INSERT/UPDATE/DELETE require the fund role.
--    New rows must start unverified so a direct insert cannot inflate the
--    balance; verification still goes through verify_contribution().
-- ----------------------------------------------------------------------------
drop policy if exists contrib_insert on public.contributions;
drop policy if exists contrib_insert_treasurer on public.contributions;
drop policy if exists contrib_insert_finance on public.contributions;
drop policy if exists contrib_update_own_unverified on public.contributions;
drop policy if exists contrib_no_direct_update on public.contributions;
drop policy if exists contrib_update_finance on public.contributions;
drop policy if exists contrib_no_delete on public.contributions;
drop policy if exists contrib_delete_finance on public.contributions;

create policy contrib_insert_finance on public.contributions
  for insert to authenticated
  with check (
    (select public.can_write_fund())
    and status in ('declared', 'pending_verification')
  );

create policy contrib_update_finance on public.contributions
  for update to authenticated
  using ((select public.can_write_fund()))
  with check ((select public.can_write_fund()));

create policy contrib_delete_finance on public.contributions
  for delete to authenticated
  using ((select public.can_write_fund()));

-- ----------------------------------------------------------------------------
-- 3) Expenses. Same split: family can read (expense_read, unchanged);
--    only treasurer or admin can insert, update, or delete. A direct insert
--    must land as 'submitted' and be attributed to the caller.
-- ----------------------------------------------------------------------------
drop policy if exists expense_insert on public.expenses;
drop policy if exists expense_insert_treasurer on public.expenses;
drop policy if exists expense_insert_finance on public.expenses;
drop policy if exists expense_no_update_direct on public.expenses;
drop policy if exists expense_update_finance on public.expenses;
drop policy if exists expense_no_delete on public.expenses;
drop policy if exists expense_delete_finance on public.expenses;

create policy expense_insert_finance on public.expenses
  for insert to authenticated
  with check (
    (select public.can_write_fund())
    and requested_by = (select auth.uid())
    and status = 'submitted'
  );

create policy expense_update_finance on public.expenses
  for update to authenticated
  using ((select public.can_write_fund()))
  with check ((select public.can_write_fund()));

create policy expense_delete_finance on public.expenses
  for delete to authenticated
  using ((select public.can_write_fund()));

-- ----------------------------------------------------------------------------
-- 4) Audited functions that 0011 limited to jwt_role() = 'treasurer'.
--    Admins keep the same transitions. Bodies otherwise match 0011 so existing
--    rows and the status machine are unchanged. Signatures are unchanged, so
--    existing EXECUTE grants stay.
-- ----------------------------------------------------------------------------
create or replace function public.record_contribution_as_treasurer(
  p_member uuid, p_amount bigint, p_month text,
  p_method public.payment_method default 'upi_online', p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can record fund entries';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_member is null or not exists (select 1 from public.profiles where id = p_member) then
    raise exception 'unknown member';
  end if;
  insert into public.contributions (member_id, amount_paise, month_ref, method, note, status)
  values (p_member, p_amount, nullif(p_month,''), coalesce(p_method,'upi_online'), p_note, 'pending_verification')
  returning id into v_id;
  perform public.log_audit(auth.uid(), 'contribution.record', 'contributions', v_id::text,
                           jsonb_build_object('member', p_member, 'amount_paise', p_amount,
                                              'month', p_month, 'method', p_method));
  return v_id;
end $$;

create or replace function public.approve_expense(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can approve expenses';
  end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'not found'; end if;
  if e.status <> 'submitted' then raise exception 'only submitted expenses can be approved'; end if;
  update public.expenses set status='approved', approved_by=auth.uid(), approved_at=now() where id=p_id;
  perform public.log_audit(auth.uid(), 'expense.approve', 'expenses', p_id::text,
                           jsonb_build_object('amount_paise', e.amount_paise));
end $$;

create or replace function public.reject_expense(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can reject expenses';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'not found'; end if;
  if e.status not in ('submitted','approved') then raise exception 'cannot reject in status %', e.status; end if;
  update public.expenses set status='rejected', reject_reason=trim(p_reason),
         approved_by=auth.uid(), approved_at=now() where id=p_id;
  perform public.log_audit(auth.uid(), 'expense.reject', 'expenses', p_id::text,
                           jsonb_build_object('reason', trim(p_reason)));
end $$;

create or replace function public.pay_expense(p_id uuid, p_bank_ref text, p_receipt_path text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can disburse funds';
  end if;
  if p_bank_ref is null or length(trim(p_bank_ref)) < 3 then raise exception 'payment reference required'; end if;
  if p_receipt_path is null or length(trim(p_receipt_path)) < 3 then raise exception 'receipt upload required'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'not found'; end if;
  if e.status <> 'approved' then raise exception 'expense must be approved before payment'; end if;
  update public.expenses set status='paid', paid_at=now(), bank_ref=trim(p_bank_ref),
         receipt_path=trim(p_receipt_path) where id=p_id;
  perform public.log_audit(auth.uid(), 'expense.pay', 'expenses', p_id::text,
                           jsonb_build_object('amount_paise', e.amount_paise, 'ref', trim(p_bank_ref)));
end $$;

create or replace function public.reverse_expense(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can reverse payments';
  end if;
  if p_note is null or length(trim(p_note)) < 5 then raise exception 'reversal needs an explanatory note'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'not found'; end if;
  if e.status <> 'paid' then raise exception 'only paid expenses can be reversed'; end if;
  update public.expenses set status='reversed', reversed_by=auth.uid(), reversed_at=now(),
         reversal_note=trim(p_note) where id=p_id;
  perform public.log_audit(auth.uid(), 'expense.reverse', 'expenses', p_id::text,
                           jsonb_build_object('amount_paise', e.amount_paise, 'note', trim(p_note)));
end $$;

-- Contribution transitions already called is_treasurer() (treasurer|admin).
-- Re-state the check with the shared predicate and the same error text the
-- app maps to a single denial, without changing the status machine.
create or replace function public.declare_contribution(
  p_amount bigint, p_month text, p_method public.payment_method, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can record fund entries';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into public.contributions (member_id, amount_paise, month_ref, method, note, status)
  values (auth.uid(), p_amount, nullif(p_month,''), coalesce(p_method,'upi_online'), p_note, 'pending_verification')
  returning id into v_id;
  perform public.log_audit(auth.uid(), 'contribution.record', 'contributions', v_id::text,
                           jsonb_build_object('amount_paise', p_amount, 'month', p_month, 'method', p_method));
  return v_id;
end $$;

create or replace function public.verify_contribution(p_id uuid, p_bank_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can verify payments';
  end if;
  if p_bank_ref is null or length(trim(p_bank_ref)) < 3 then
    raise exception 'reference required — for cash use the word CASH plus a voucher number';
  end if;
  select * into c from public.contributions where id = p_id;
  if c.id is null then raise exception 'not found'; end if;
  if c.status <> 'pending_verification' then
    raise exception 'only pending payments can be verified (current: %)', c.status;
  end if;
  update public.contributions
     set status='verified', verified_by=auth.uid(), verified_at=now(), bank_ref=trim(p_bank_ref)
   where id = p_id;
  perform public.log_audit(auth.uid(), 'contribution.verify', 'contributions', p_id::text,
                           jsonb_build_object('amount_paise', c.amount_paise, 'ref', trim(p_bank_ref)));
end $$;

create or replace function public.reject_contribution(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can reject entries';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required'; end if;
  select * into c from public.contributions where id = p_id;
  if c.id is null then raise exception 'not found'; end if;
  if c.status not in ('declared','pending_verification') then
    raise exception 'cannot reject a % entry', c.status;
  end if;
  update public.contributions
     set status='rejected', reject_reason=trim(p_reason), verified_by=auth.uid(), verified_at=now()
   where id = p_id;
  perform public.log_audit(auth.uid(), 'contribution.reject', 'contributions', p_id::text,
                           jsonb_build_object('reason', trim(p_reason)));
end $$;

create or replace function public.reverse_contribution(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  if not public.can_write_fund() then
    raise exception 'only a treasurer or an admin can reverse entries';
  end if;
  if p_note is null or length(trim(p_note)) < 5 then raise exception 'reversal needs an explanatory note'; end if;
  select * into c from public.contributions where id = p_id;
  if c.id is null then raise exception 'not found'; end if;
  if c.status <> 'verified' then raise exception 'only verified payments can be reversed'; end if;
  update public.contributions
     set status='reversed', reversed_by=auth.uid(), reversed_at=now(), reversal_note=trim(p_note)
   where id = p_id;
  perform public.log_audit(auth.uid(), 'contribution.reverse', 'contributions', p_id::text,
                           jsonb_build_object('amount_paise', c.amount_paise, 'note', trim(p_note)));
end $$;

-- Profile edits (including assigning treasurer) rewrite the stored
-- phone_normalized column, which calls this pure string function. 0010 revoked
-- it from public/anon; signed-in users still need it or every profile update
-- fails before the role change is saved. It reads no tables.
grant execute on function public.normalize_phone(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Assigning treasurer. The member screen updates profiles.role. A signed-in
--    member still cannot change roles. Service-role account creation has no
--    auth.uid() (same trust model as guard_membership_change) so an admin
--    action can set the role while creating the account. Audit row is unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.guard_profile_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_treasurer_or_admin() then
    raise exception 'Only treasurers/admins may change roles';
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    perform public.log_audit(new.id, 'profile.update', 'profiles', new.id::text,
      jsonb_build_object('role_before', old.role, 'role_after', new.role,
                         'branch_before', old.branch_id, 'branch_after', new.branch_id));
  end if;
  return new;
end $$;
