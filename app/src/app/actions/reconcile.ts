'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import type { StatementBatch, StatementRowView, ReconcileReport, LedgerCandidate } from '@/lib/types';
import type { StatementRow } from '@/lib/csv';
import type { ActionResult } from './fund';

// ---------------------------------------------------------------------------
// Phase 8 — Bank reconciliation. ALL of this is treasurer/admin territory:
// RLS hides statement tables from everyone else, and the SECURITY DEFINER
// functions in 0005_reconciliation_reports.sql re-check the role claim.
// Importing/matching NEVER mutates contributions or expenses.
// ---------------------------------------------------------------------------

export async function importStatementBatch(
  label: string,
  rows: StatementRow[],
): Promise<ActionResult & { batchId?: string }> {
  const profile = await requireProfile();
  if (profile.role !== 'treasurer' && profile.role !== 'admin') {
    return { ok: false, error: 'Only the treasurer can import bank statements.' };
  }
  if (label.trim().length < 3) return { ok: false, error: 'Give the batch a label.' };
  if (rows.length === 0) return { ok: false, error: 'Nothing to import — no valid rows were parsed.' };
  if (rows.length > 2000) return { ok: false, error: 'Too many rows (max 2000 per batch).' };

  const supabase = await createClient();
  const payload = rows.map((r) => ({
    date: r.date,
    description: r.description,
    reference: r.reference,
    amount_rupees: r.amountRupees,
  }));
  const { data, error } = await supabase.rpc('import_statement_batch', {
    p_label: label.trim(),
    p_rows: payload,
  });
  if (error) return { ok: false, error: error.message.replace(/^.*?: /, '') };
  revalidatePath('/reconcile');
  return { ok: true, batchId: String(data) };
}

export interface StatementPage {
  batches: StatementBatch[];
  rows: StatementRowView[];
}

/** Latest batches + newest rows (RLS: finance roles only). */
export async function getStatementData(limitRows = 300): Promise<StatementPage> {
  const supabase = await createClient();
  const [{ data: batches }, { data: rows }] = await Promise.all([
    supabase
      .from('statement_batches')
      .select('id, label, imported_by, imported_at, row_count')
      .order('imported_at', { ascending: false })
      .limit(12),
    supabase
      .from('bank_statement_rows')
      .select(
        'id, batch_id, txn_date, description, reference, amount_paise, matched_kind, matched_id, matched_at, statement_batches ( label )',
      )
      .order('txn_date', { ascending: false })
      .order('id')
      .limit(limitRows),
  ]);
  return {
    batches: (batches ?? []) as unknown as StatementBatch[],
    rows: (rows ?? []) as unknown as StatementRowView[],
  };
}

/**
 * Unmatched ledger candidates for the "match" sheet. Only money that has
 * actually hit/ left the account per the ledger (verified / paid) — pending
 * pledges are intentionally excluded, mirroring match_statement_row().
 */
export async function getLedgerCandidates(): Promise<LedgerCandidate[]> {
  const supabase = await createClient();
  const [contribs, expenses] = await Promise.all([
    supabase
      .from('contributions')
      .select('id, member_id, amount_paise, month_ref, verified_at, bank_ref, profiles ( full_name )')
      .eq('status', 'verified')
      .order('verified_at', { ascending: false })
      .limit(150),
    supabase
      .from('expenses')
      .select('id, title, amount_paise, paid_at, bank_ref')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(150),
  ]);

  const out: LedgerCandidate[] = [];
  for (const c of (contribs.data ?? []) as unknown as {
    id: string; member_id: string; amount_paise: number; month_ref: string | null;
    verified_at: string; bank_ref: string | null; profiles: { full_name: string } | null;
  }[]) {
    out.push({
      kind: 'contribution',
      id: c.id,
      label: c.profiles?.full_name ?? 'Member',
      sub: `${c.month_ref ?? 'voluntary'} · ${c.bank_ref ?? 'no ref'}`,
      amount_paise: c.amount_paise,
      occurred_at: c.verified_at,
      direction: 'in',
    });
  }
  for (const e of (expenses.data ?? []) as unknown as {
    id: string; title: string; amount_paise: number; paid_at: string | null; bank_ref: string | null;
  }[]) {
    out.push({
      kind: 'expense',
      id: e.id,
      label: e.title,
      sub: e.bank_ref ?? 'no ref',
      amount_paise: e.amount_paise,
      occurred_at: e.paid_at ?? '',
      direction: 'out',
    });
  }
  return out;
}

/** Rows already matched — used to prevent double-matching one ledger record. */
export async function getMatchedLedgerIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('bank_statement_rows')
    .select('matched_id')
    .not('matched_id', 'is', null);
  return (data ?? []).map((r) => r.matched_id as string);
}

export async function matchStatementRow(
  rowId: string,
  kind: 'contribution' | 'expense',
  targetId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('match_statement_row', {
    p_row_id: rowId,
    p_kind: kind,
    p_target_id: targetId,
  });
  if (error) return { ok: false, error: error.message.replace(/^.*?: /, '') };
  revalidatePath('/reconcile');
  return { ok: true };
}

export async function unmatchStatementRow(rowId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('unmatch_statement_row', { p_row_id: rowId });
  if (error) return { ok: false, error: error.message.replace(/^.*?: /, '') };
  revalidatePath('/reconcile');
  return { ok: true };
}

export async function getReconcileReport(asOf: string): Promise<ReconcileReport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reconcile_as_of', { p_as_of: asOf });
  if (error || !data) return null;
  const r = Array.isArray(data) ? data[0] : data;
  return {
    bank_in_paise: Number(r.bank_in_paise),
    bank_out_paise: Number(r.bank_out_paise),
    bank_net_paise: Number(r.bank_net_paise),
    ledger_verified_in_paise: Number(r.ledger_verified_in_paise),
    ledger_paid_out_paise: Number(r.ledger_paid_out_paise),
    ledger_balance_paise: Number(r.ledger_balance_paise),
    diff_in_paise: Number(r.diff_in_paise),
    diff_out_paise: Number(r.diff_out_paise),
    unmatched_bank_rows: Number(r.unmatched_bank_rows),
  } as ReconcileReport;
}
