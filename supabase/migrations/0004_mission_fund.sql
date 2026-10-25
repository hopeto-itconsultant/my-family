-- ============================================================================
-- 0004 — Phases 6 & 7: Mission Fund.
--   * contributions: declared → pending_verification → verified | rejected,
--                    plus reversal (append-only correction, never silent edits)
--   * expenses:      submitted → approved | rejected → paid (receipt required),
--                    paid → reversed
--   * balance is ALWAYS computed in Postgres from verified/paid rows only.
--     Unverified payments are visible family-wide but NEVER counted as received.
--   * state transitions run through SECURITY DEFINER functions so the status
--     machine + audit trail cannot be bypassed even by a buggy client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Contributions
-- ----------------------------------------------------------------------------
create type public.contribution_status as enum
  ('declared','pending_verification','verified','rejected','reversed');
create type public.payment_method as enum ('upi','bank_transfer','cash','other');

create table public.contributions (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles (id) on delete cascade,
  amount_paise   bigint not null check (amount_paise > 0),
  month_ref      text check (month_ref is null or month_ref ~ '^\d{4}-\d{2}$'), -- monthly pledge period
  method         public.payment_method not null default 'upi',
  status         public.contribution_status not null default 'declared',
  bank_ref       text,                       -- UPI txn / bank reference captured at verification
  note           text check (note is null or char_length(note) <= 400),
  declared_at    timestamptz not null default now(),
  verified_by    uuid references public.profiles (id),
  verified_at    timestamptz,
  reject_reason  text,
  reversed_by    uuid references public.profiles (id),
  reversed_at    timestamptz,
  reversal_note  text,
  constraint verified_shape check (
    (status = 'verified' and verified_by is not null and verified_at is not null)
    or status <> 'verified'
  )
);
create index contrib_member_idx  on public.contributions (member_id, month_ref);
create index contrib_status_idx  on public.contributions (status, declared_at desc);

alter table public.contributions enable row level security;

-- Family-wide visibility of contribution records (trust requirement).
create policy contrib_read on public.contributions
  for select to authenticated using (true);

-- Members declare their own payments; they always start as 'declared'.
create policy contrib_insert on public.contributions
  for insert to authenticated
  with check (member_id = auth.uid() and status = 'declared');

-- A member may withdraw a payment they declared but which has NOT been
-- verified yet (moves it to 'rejected' with a reason). Verified money can
-- only be corrected via reverse_contribution() by a treasurer.
create policy contrib_update_own_unverified on public.contributions
  for update to authenticated
  using (member_id = auth.uid() and status in ('declared','pending_verification'))
  with check (member_id = auth.uid() and status = 'rejected');

-- No direct UPDATE/DELETE of money rows by clients at all otherwise —
-- everything goes through the guarded functions below.
create policy contrib_no_delete on public.contributions
  for delete to authenticated using (false);

-- ----------------------------------------------------------------------------
-- Expenses
-- ----------------------------------------------------------------------------
create type public.expense_status as enum
  ('submitted','approved','rejected','paid','reversed');

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 2 and 160),
  purpose       text check (purpose is null or char_length(purpose) <= 600),
  amount_paise  bigint not null check (amount_paise > 0),
  requested_by  uuid not null references public.profiles (id) on delete cascade,
  status        public.expense_status not null default 'submitted',
  approved_by   uuid references public.profiles (id),
  approved_at   timestamptz,
  paid_at       timestamptz,
  bank_ref      text,                        -- outbound transfer reference
  receipt_path  text,                        -- object path inside private 'receipts' bucket
  reject_reason text,
  reversed_by   uuid references public.profiles (id),
  reversed_at   timestamptz,
  reversal_note text,
  created_at    timestamptz not null default now(),
  constraint paid_needs_receipt check (status <> 'paid' or (receipt_path is not null and paid_at is not null))
);
create index expense_status_idx on public.expenses (status, created_at desc);

alter table public.expenses enable row level security;

-- Whole family sees requests and outcomes (transparency); receipts themselves
-- stay in private storage, signed URLs minted server-side after this RLS pass.
create policy expense_read on public.expenses
  for select to authenticated using (true);

-- Any member may submit an expense request (still just 'submitted').
create policy expense_insert on public.expenses
  for insert to authenticated
  with check (requested_by = auth.uid() and status = 'submitted');

create policy expense_no_update_direct on public.expenses
  for update to authenticated using (false);

create policy expense_no_delete on public.expenses
  for delete to authenticated using (false);

-- ----------------------------------------------------------------------------
-- Guarded transition functions (SECURITY DEFINER, role-checked internally)
-- ----------------------------------------------------------------------------
create or replace function public.is_treasurer()
returns boolean language sql stable set search_path = public as $$
  select public.jwt_role() in ('treasurer','admin');
$$;

-- Declare intent ("I will pay ₹500 this month") — visible, not counted.
create or replace function public.declare_contribution(
  p_amount bigint, p_month text, p_method public.payment_method, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into public.contributions (member_id, amount_paise, month_ref, method, note, status)
  values (auth.uid(), p_amount, nullif(p_month,''), coalesce(p_method,'upi'), p_note, 'declared')
  returning id into v_id;
  perform public.log_audit(auth.uid(), 'contribution.declare', 'contributions', v_id::text,
                           jsonb_build_object('amount_paise', p_amount, 'month', p_month));
  return v_id;
end $$;

-- Mark "money sent" → pending_verification (still NOT counted until verified).
create or replace function public.mark_contribution_sent(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  select * into c from public.contributions where id = p_id;
  if c.id is null then raise exception 'not found'; end if;
  if c.member_id <> auth.uid() then raise exception 'only the owner can update their declaration'; end if;
  if c.status <> 'declared' then raise exception 'only a declared pledge can be marked sent'; end if;
  update public.contributions set status='pending_verification' where id = p_id;
  perform public.log_audit(auth.uid(), 'contribution.mark_sent', 'contributions', p_id::text, '{}'::jsonb);
end $$;

-- Treasurer verifies against the actual bank/UPI statement. Requires a ref.
create or replace function public.verify_contribution(p_id uuid, p_bank_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
  if p_bank_ref is null or length(trim(p_bank_ref)) < 3 then
    raise exception 'bank/UPI reference is required to verify a payment';
  end if;
  select * into c from public.contributions where id = p_id;
  if c.id is null then raise exception 'not found'; end if;
  if c.status not in ('declared','pending_verification') then
    raise exception 'only declared/pending payments can be verified (current: %)', c.status;
  end if;
  update public.contributions
     set status='verified', verified_by=auth.uid(), verified_at=now(), bank_ref=trim(p_bank_ref)
   where id = p_id;
  perform public.log_audit(auth.uid(), 'contribution.verify', 'contributions', p_id::text,
                           jsonb_build_object('amount_paise', c.amount_paise, 'bank_ref', trim(p_bank_ref)));
end $$;

create or replace function public.reject_contribution(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required'; end if;
  select * into c from public.contributions where id = p_id;
  if c.id is null then raise exception 'not found'; end if;
  if c.status not in ('declared','pending_verification') then
    raise exception 'cannot reject a % payment', c.status;
  end if;
  update public.contributions
     set status='rejected', reject_reason=trim(p_reason), verified_by=auth.uid(), verified_at=now()
   where id = p_id;
  perform public.log_audit(auth.uid(), 'contribution.reject', 'contributions', p_id::text,
                           jsonb_build_object('reason', trim(p_reason)));
end $$;

-- Reversal of VERIFIED money: append-only correction, never a silent edit.
create or replace function public.reverse_contribution(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
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

create or replace function public.approve_expense(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
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
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'not found'; end if;
  if e.status not in ('submitted','approved') then raise exception 'cannot reject in status %', e.status; end if;
  update public.expenses set status='rejected', reject_reason=trim(p_reason),
         approved_by=auth.uid(), approved_at=now() where id=p_id;
  perform public.log_audit(auth.uid(), 'expense.reject', 'expenses', p_id::text,
                           jsonb_build_object('reason', trim(p_reason)));
end $$;

-- Disburse: requires approval + uploaded receipt + bank reference. Only then
-- does the money leave the computed balance.
create or replace function public.pay_expense(p_id uuid, p_bank_ref text, p_receipt_path text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
  if p_bank_ref is null or length(trim(p_bank_ref)) < 3 then raise exception 'bank reference required'; end if;
  if p_receipt_path is null or length(trim(p_receipt_path)) < 3 then raise exception 'receipt upload required'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'not found'; end if;
  if e.status <> 'approved' then raise exception 'expense must be approved before payment'; end if;
  update public.expenses set status='paid', paid_at=now(), bank_ref=trim(p_bank_ref),
         receipt_path=trim(p_receipt_path) where id=p_id;
  perform public.log_audit(auth.uid(), 'expense.pay', 'expenses', p_id::text,
                           jsonb_build_object('amount_paise', e.amount_paise, 'bank_ref', trim(p_bank_ref)));
end $$;

create or replace function public.reverse_expense(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
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
-- The single source of truth for money math (computed, never stored)
-- ----------------------------------------------------------------------------
create or replace view public.fund_summary as
select
  coalesce((select sum(amount_paise) from public.contributions
            where status = 'verified'), 0)                                  as verified_in_paise,
  coalesce((select sum(amount_paise) from public.expenses
            where status = 'paid'), 0)                                      as paid_out_paise,
  coalesce((select sum(amount_paise) from public.contributions
            where status = 'verified'), 0)
  - coalesce((select sum(amount_paise) from public.expenses
              where status = 'paid'), 0)                                    as balance_paise,
  coalesce((select sum(amount_paise) from public.contributions
            where status in ('declared','pending_verification')), 0)        as awaiting_verification_paise,
  coalesce((select count(*) from public.contributions
            where status in ('declared','pending_verification')), 0)::int   as awaiting_verification_count,
  coalesce((select sum(amount_paise) from public.expenses
            where status in ('submitted','approved')), 0)                   as pending_spend_paise,
  coalesce((select count(*) from public.expenses
            where status in ('submitted','approved')), 0)::int              as pending_spend_count;

-- Per-branch monthly collection (verified vs pledged), used on the dashboard.
create or replace view public.branch_month_collection as
select b.id as branch_id, b.name as branch_name,
       c.month_ref,
       sum(c.amount_paise) filter (where c.status = 'verified')   as verified_paise,
       sum(c.amount_paise) filter (where c.status in ('declared','pending_verification')) as pending_paise,
       count(*) filter (where c.status = 'verified')::int         as verified_count
from public.branches b
join public.profiles p on p.branch_id = b.id
join public.contributions c on c.member_id = p.id
group by b.id, b.name, c.month_ref;

grant execute on function
  public.declare_contribution(bigint,text,public.payment_method,text),
  public.mark_contribution_sent(uuid),
  public.verify_contribution(uuid,text),
  public.reject_contribution(uuid,text),
  public.reverse_contribution(uuid,text),
  public.approve_expense(uuid),
  public.reject_expense(uuid,text),
  public.pay_expense(uuid,text,text),
  public.reverse_expense(uuid,text)
to authenticated;
