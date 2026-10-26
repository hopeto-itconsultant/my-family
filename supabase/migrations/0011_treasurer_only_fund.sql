-- ============================================================================
-- 0008 — Treasurer-only Mission Fund entries (family policy update).
--   * One designated person maintains all fund records: the TREASURER.
--     A single treasurer is enforced at the database level (partial unique
--     index). Admins keep oversight powers but do not post money rows.
--   * All other members are VIEW-ONLY for contributions & expenses.
--   * Entries are manual only; bank reconciliation is retired (see below).
--   * Payment method is restricted to CASH or UPI/ONLINE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Exactly one active treasurer in the family
-- ----------------------------------------------------------------------------
create unique index if not exists profiles_single_treasurer_idx
  on public.profiles ((role)) where role = 'treasurer';
-- [hws fix] original indexed (id), which is always unique and so never limited
-- the family to one treasurer.
-- (Supabase deletes users via the admin API, which cascades profiles through
--  the FK, so a deleted treasurer frees the slot automatically.)

-- ----------------------------------------------------------------------------
-- 2) Payment methods: cash | upi_online only
-- ----------------------------------------------------------------------------
alter table public.contributions alter column method drop default;
-- [hws fix] original deleted rows from "public.pg_depend" (no such table; a
-- catalog hack) and dropped the type while contributions.method and
-- declare_contribution() still used it. Do a safe rename/swap instead.
-- (contributions had 0 rows when this was applied.)
drop function if exists public.declare_contribution(bigint, text, public.payment_method, text);
alter type public.payment_method rename to payment_method_old;
create type public.payment_method as enum ('cash', 'upi_online');
alter table public.contributions
  alter column method type public.payment_method using (
    case method::text when 'cash' then 'cash' else 'upi_online' end
  )::public.payment_method;
drop type public.payment_method_old;
alter table public.contributions alter column method set default 'upi_online';

-- ----------------------------------------------------------------------------
-- 3) Contributions: treasurer writes, everyone reads
-- ----------------------------------------------------------------------------
drop policy if exists contrib_insert on public.contributions;
drop policy if exists contrib_update_own_unverified on public.contributions;

create policy contrib_insert_treasurer on public.contributions
  for insert to authenticated
  with check (public.is_treasurer() and member_id = auth.uid());
  -- The guarded RPCs always stamp member_id = auth.uid(); this policy simply
  -- requires that writer to be the treasurer. Everyone else is refused.

-- Verified/pending rows are corrected ONLY through reverse_contribution().
create policy contrib_no_direct_update on public.contributions
  for update to authenticated using (false);

-- ----------------------------------------------------------------------------
-- 4) Expenses: treasurer submits/approves/pays, everyone reads
-- ----------------------------------------------------------------------------
drop policy if exists expense_insert on public.expenses;

create policy expense_insert_treasurer on public.expenses
  for insert to authenticated
  with check (public.is_treasurer() and requested_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 5) Tighten every guarded transition function to the treasurer
--    (admins can flip roles but no longer touch money rows directly)
-- ----------------------------------------------------------------------------
create or replace function public.declare_contribution(
  p_amount bigint, p_month text, p_method public.payment_method, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_treasurer() then raise exception 'only the treasurer can record fund entries'; end if;
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
  if not public.is_treasurer() then raise exception 'only the treasurer can verify payments'; end if;
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
  if not public.is_treasurer() then raise exception 'only the treasurer can reject entries'; end if;
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
  if not public.is_treasurer() then raise exception 'only the treasurer can reverse entries'; end if;
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

-- Expense transitions: treasurer only (approve/reject/pay/reverse already used
-- is_treasurer(); redefined here so admins no longer pass the check).
create or replace function public.approve_expense(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if public.jwt_role() <> 'treasurer' then raise exception 'only the treasurer may approve expenses'; end if;
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
  if public.jwt_role() <> 'treasurer' then raise exception 'only the treasurer may reject expenses'; end if;
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
  if public.jwt_role() <> 'treasurer' then raise exception 'only the treasurer may disburse funds'; end if;
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
  if public.jwt_role() <> 'treasurer' then raise exception 'only the treasurer may reverse payments'; end if;
  if p_note is null or length(trim(p_note)) < 5 then raise exception 'reversal needs an explanatory note'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'not found'; end if;
  if e.status <> 'paid' then raise exception 'only paid expenses can be reversed'; end if;
  update public.expenses set status='reversed', reversed_by=auth.uid(), reversed_at=now(),
         reversal_note=trim(p_note) where id=p_id;
  perform public.log_audit(auth.uid(), 'expense.reverse', 'expenses', p_id::text,
                           jsonb_build_object('amount_paise', e.amount_paise, 'note', trim(p_note)));
end $$;

-- ----------------------------------------------------------------------------
-- 6) Retire bank reconciliation (manual entries only, per family decision).
--    Tables kept for history/audit; client access fully revoked.
-- ----------------------------------------------------------------------------
revoke execute on function
  public.import_statement_batch(text, jsonb),
  public.match_statement_row(uuid, text, uuid),
  public.unmatch_statement_row(uuid),
  public.reconcile_as_of(date)
from authenticated, anon;

-- ----------------------------------------------------------------------------
-- 7) mark_contribution_sent is obsolete (treasurer records go straight to
--    pending_verification). Revoke so old clients cannot call it.
-- ----------------------------------------------------------------------------
revoke execute on function public.mark_contribution_sent(uuid) from authenticated, anon;

-- ----------------------------------------------------------------------------
-- 8) record_contribution_as_treasurer: the treasurer posts an entry ON BEHALF
--    of a member (the only way contributions are created now). Duplicate-
--    guard prevents double-posting the same month+amount for one person.
-- ----------------------------------------------------------------------------
create unique index if not exists contrib_dupe_guard_idx
  on public.contributions (member_id, month_ref, amount_paise)
  where status in ('pending_verification','verified') and month_ref is not null;

create or replace function public.record_contribution_as_treasurer(
  p_member uuid, p_amount bigint, p_month text,
  p_method public.payment_method default 'upi_online', p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.jwt_role() <> 'treasurer' then
    raise exception 'only the treasurer can record fund entries';
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
grant execute on function public.record_contribution_as_treasurer(uuid,bigint,text,public.payment_method,text) to authenticated;

-- [hws fix] re-grant the recreated function to signed-in users only (0009 lockdown).
revoke execute on function public.declare_contribution(bigint,text,public.payment_method,text) from public, anon;
grant execute on function public.declare_contribution(bigint,text,public.payment_method,text) to authenticated;
revoke execute on function public.record_contribution_as_treasurer(uuid,bigint,text,public.payment_method,text) from public, anon;
