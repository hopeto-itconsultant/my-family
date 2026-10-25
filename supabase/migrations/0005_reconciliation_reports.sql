-- ============================================================================
-- 0005_reconciliation_reports.sql — Phase 8: bank-statement reconciliation
-- ----------------------------------------------------------------------------
-- Design rules carried from earlier phases:
--   * The ledger (contributions/expenses) remains the ONLY source of truth for
--     the family-visible balance. Bank statement rows are an external,
--     treasurer-managed worksheet used to CHECK the ledger, never to change it.
--   * Matching a statement row does NOT create or verify any contribution.
--     Verification still happens only through verify_contribution() in 0004.
--   * Discrepancies are reported; they never mutate money records silently.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Statement batches (one CSV export per bank account / period)
-- ----------------------------------------------------------------------------
create table public.statement_batches (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (length(trim(label)) between 3 and 120),
  imported_by  uuid not null references public.profiles (id),
  imported_at  timestamptz not null default now(),
  row_count    int  not null default 0
);

-- ----------------------------------------------------------------------------
-- Parsed statement rows. Amount is SIGNED paise: positive = money in
-- (UPI credits, deposits), negative = money out (transfers, ATM).
-- Raw metadata is preserved so re-imports remain auditable.
-- ----------------------------------------------------------------------------
create table public.bank_statement_rows (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.statement_batches (id) on delete cascade,
  txn_date      date not null,
  description   text not null,
  reference     text,                       -- UPI / NEFT / cheque ref as printed
  amount_paise  bigint not null,
  matched_kind  text check (matched_kind in ('contribution','expense') or matched_kind is null),
  matched_id    uuid,                       -- FK added below (deferred so drops stay easy)
  matched_by    uuid references public.profiles (id),
  matched_at    timestamptz,
  unique (batch_id, txn_date, description, amount_paise, reference)
);

alter table public.bank_statement_rows
  add constraint bank_rows_matched_contrib_fk
  foreign key (matched_id) references public.contributions (id)
  where matched_kind = 'contribution';

create index statement_rows_date_idx on public.bank_statement_rows (txn_date desc);
create index statement_rows_unmatched_idx on public.bank_statement_rows (matched_id)
  where matched_id is null;

-- ----------------------------------------------------------------------------
-- RLS — statement data lives OUTSIDE the family-wide read policies.
-- Only finance roles (treasurer/admin) may see or touch it. Members cannot
-- even enumerate bank activity beyond what the ledger already shows them.
-- ----------------------------------------------------------------------------
alter table public.statement_batches enable row level security;
alter table public.bank_statement_rows enable row level security;

-- Reuse the finance check from 0001/0004: role claim in JWT app_metadata.
-- (is_treasurer() was defined in 0004 and returns true for treasurer+admin.)
create policy fin_batches_all on public.statement_batches
  to authenticated using (public.is_treasurer()) with check (public.is_treasurer());

create policy fin_rows_all on public.bank_statement_rows
  to authenticated using (public.is_treasurer()) with check (public.is_treasurer());

-- ----------------------------------------------------------------------------
-- import_statement_batch(rows jsonb, label text) — SECURITY DEFINER, treasurer
-- only. Inserts a batch + its rows atomically and writes one audit entry.
-- Payload shape per row: { "date": "YYYY-MM-DD", "description": "...",
--                          "reference": "...", "amount_rupees": "-1,500.00" }
-- Amount conversion to integer paise happens HERE, in Postgres, so the audit
-- trail records exactly what the database stored.
-- ----------------------------------------------------------------------------
create or replace function public.import_statement_batch(p_label text, p_rows jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_batch  uuid := gen_random_uuid();
  v_r      jsonb;
  v_amt    bigint;
  v_count  int := 0;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
  if p_label is null or length(trim(p_label)) < 3 then raise exception 'batch label required'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a JSON array'; end if;

  insert into public.statement_batches (id, label, imported_by, row_count)
  values (v_batch, trim(p_label), auth.uid(), 0);

  for v_r in select * from jsonb_array_elements(p_rows) loop
    -- strip separators, parse as numeric rupees → integer paise
    v_amt := (round((replace(coalesce(v_r->>'amount_rupees',''), ',', ''))::numeric * 100))::bigint;
    if v_amt is null or v_amt = 0 then continue; end if;
    insert into public.bank_statement_rows (id, batch_id, txn_date, description, reference, amount_paise)
    values (gen_random_uuid(), v_batch,
            (v_r->>'date')::date,
            left(coalesce(v_r->>'description','(no description)'), 200),
            nullif(trim(coalesce(v_r->>'reference','')), ''),
            v_amt)
    on conflict (batch_id, txn_date, description, amount_paise, reference) do nothing;
    v_count := v_count + 1;
  end loop;

  update public.statement_batches set row_count = v_count where id = v_batch;
  perform public.log_audit(auth.uid(), 'statement.import', 'statement_batches', v_batch::text,
                           jsonb_build_object('label', trim(p_label), 'row_count', v_count));
  return v_batch;
end $$;

-- ----------------------------------------------------------------------------
-- match_statement_row(row_id, kind, target_id) — links a bank credit/debit to a
-- ledger record for reconciliation evidence. Does NOT change any status.
-- Guardrails enforced here AND surfaced in the UI copy:
--   * contributions must be verified before they can be matched (a pending
--     pledge has no business appearing in the bank),
--   * expenses must be paid,
--   * amounts must be equal (credits vs verified inflow; debits vs paid outflow),
--   * one ledger record ↔ at most one statement row.
-- ----------------------------------------------------------------------------
create or replace function public.match_statement_row(p_row_id uuid, p_kind text, p_target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.bank_statement_rows;
  c public.contributions;
  e public.expenses;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
  select * into r from public.bank_statement_rows where id = p_row_id;
  if r.id is null then raise exception 'statement row not found'; end if;
  if r.matched_id is not null then raise exception 'this bank row is already matched'; end if;

  if p_kind = 'contribution' then
    select * into c from public.contributions where id = p_target_id;
    if c.id is null then raise exception 'contribution not found'; end if;
    if c.status <> 'verified' then
      raise exception 'only VERIFIED contributions can match bank money — verify it first';
    end if;
    if r.amount_paise <= 0 then raise exception 'bank row is not a credit (money in)'; end if;
    if r.amount_paise <> c.amount_paise then
      raise exception 'amount mismatch: bank % vs ledger %', r.amount_paise, c.amount_paise;
    end if;
  elsif p_kind = 'expense' then
    select * into e from public.expenses where id = p_target_id;
    if e.id is null then raise exception 'expense not found'; end if;
    if e.status <> 'paid' then
      raise exception 'only PAID expenses can match bank debits';
    end if;
    if r.amount_paise >= 0 then raise exception 'bank row is not a debit (money out)'; end if;
    if -r.amount_paise <> e.amount_paise then
      raise exception 'amount mismatch: bank % vs ledger %', -r.amount_paise, e.amount_paise;
    end if;
  else
    raise exception 'kind must be contribution or expense';
  end if;

  update public.bank_statement_rows
     set matched_kind = p_kind, matched_id = p_target_id, matched_by = auth.uid(), matched_at = now()
   where id = p_row_id;

  perform public.log_audit(auth.uid(), 'statement.match', 'bank_statement_rows', p_row_id::text,
                           jsonb_build_object('kind', p_kind, 'target_id', p_target_id));
end $$;

create or replace function public.unmatch_statement_row(p_row_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.bank_statement_rows;
begin
  if not public.is_treasurer() then raise exception 'treasurer role required'; end if;
  select * into r from public.bank_statement_rows where id = p_row_id;
  if r.id is null then raise exception 'statement row not found'; end if;
  update public.bank_statement_rows
     set matched_kind = null, matched_id = null, matched_by = null, matched_at = null
   where id = p_row_id;
  perform public.log_audit(auth.uid(), 'statement.unmatch', 'bank_statement_rows', p_row_id::text,
                           jsonb_build_object('was_kind', r.matched_kind, 'was_id', r.matched_id));
end $$;

-- ----------------------------------------------------------------------------
-- reconcile_as_of(as_of date) — discrepancy report computed on the fly.
-- Returns bank-side totals vs ledger-side totals up to the given date, plus
-- unmatched bank rows count. This is a REPORTING view; it changes nothing.
-- ----------------------------------------------------------------------------
create or replace function public.reconcile_as_of(p_as_of date)
returns table (
  bank_in_paise bigint, bank_out_paise bigint, bank_net_paise bigint,
  ledger_verified_in_paise bigint, ledger_paid_out_paise bigint, ledger_balance_paise bigint,
  diff_in_paise bigint, diff_out_paise bigint, unmatched_bank_rows int
) language sql security definer set search_path = public as $$
  select
    coalesce(sum(r.amount_paise) filter (where r.amount_paise > 0), 0)::bigint,
    -coalesce(sum(r.amount_paise) filter (where r.amount_paise < 0), 0)::bigint,
    coalesce(sum(r.amount_paise), 0)::bigint,
    coalesce((select sum(c.amount_paise) from public.contributions c
              where c.status = 'verified' and c.verified_at::date <= p_as_of), 0)::bigint,
    coalesce((select sum(e.amount_paise) from public.expenses e
              where e.status = 'paid' and e.paid_at::date <= p_as_of), 0)::bigint,
    (coalesce((select sum(c.amount_paise) from public.contributions c
               where c.status = 'verified' and c.verified_at::date <= p_as_of), 0)
     - coalesce((select sum(e.amount_paise) from public.expenses e
                 where e.status = 'paid' and e.paid_at::date <= p_as_of), 0))::bigint,
    (coalesce(sum(r.amount_paise) filter (where r.amount_paise > 0), 0)
     - coalesce((select sum(c.amount_paise) from public.contributions c
                 where c.status = 'verified' and c.verified_at::date <= p_as_of), 0))::bigint,
    (-coalesce(sum(r.amount_paise) filter (where r.amount_paise < 0), 0)
     - coalesce((select sum(e.amount_paise) from public.expenses e
                 where e.status = 'paid' and e.paid_at::date <= p_as_of), 0))::bigint,
    count(*) filter (where r.matched_id is null)::int
  from public.bank_statement_rows r
  where r.txn_date <= p_as_of;
$$;

grant execute on function
  public.import_statement_batch(text, jsonb),
  public.match_statement_row(uuid, text, uuid),
  public.unmatch_statement_row(uuid),
  public.reconcile_as_of(date)
to authenticated;

-- Audit-log visibility for statement actions follows the same leader-only
-- read policy from 0001; no new policies needed.
