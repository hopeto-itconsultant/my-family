'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { parseRupeesToPaise } from '@/lib/money';
import type { AuditRow, Contribution, Expense, PaymentMethod } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const CONTRIB_FIELDS =
  'id, member_id, amount_paise, month_ref, method, status, bank_ref, note, declared_at, verified_by, verified_at, reject_reason';
const EXPENSE_FIELDS =
  'id, title, purpose, amount_paise, requested_by, status, approved_by, approved_at, paid_at, bank_ref, receipt_path, reject_reason, created_at';

// ---------------------------------------------------------------------------
// Reads (RLS: family-wide visibility of contribution & expense records)
// ---------------------------------------------------------------------------
export interface FundSummary {
  verified_in_paise: number;
  paid_out_paise: number;
  balance_paise: number;
  awaiting_verification_paise: number;
  awaiting_verification_count: number;
  pending_spend_paise: number;
  pending_spend_count: number;
}

export async function getFundSummary(): Promise<FundSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('fund_summary').select('*').single();
  if (error || !data) return null;
  return data as FundSummary;
}

export async function getContributions(limit = 200): Promise<Contribution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contributions')
    .select(CONTRIB_FIELDS)
    .order('declared_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as Contribution[];
}

export async function getExpenses(limit = 100): Promise<Expense[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as Expense[];
}

export async function getBranchCollection(monthRef: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('branch_month_collection')
    .select('branch_id, branch_name, verified_paise, pending_paise, verified_count')
    .eq('month_ref', monthRef)
    .order('branch_name');
  if (error || !data) return [];
  return data as {
    branch_id: string;
    branch_name: string;
    verified_paise: number | null;
    pending_paise: number | null;
    verified_count: number | null;
  }[];
}

/** Leaders only (RLS). Newest first. */
export async function getAuditTrail(limit = 40): Promise<AuditRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, at, actor_id, action, entity, entity_id, detail')
    .in('entity', ['contributions', 'expenses'])
    .order('at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as AuditRow[];
}

/** Short-lived signed URL for a receipt PDF/image — treasurer-gated by storage RLS. */
export async function getReceiptUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60 * 5);
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Treasurer-only write flows — ALWAYS go through the guarded DB functions.
// Migration 0008 makes the TREASURER the single person who records fund
// entries; every other role is view-only (RLS refuses their writes, and the
// SECURITY DEFINER functions re-check the role inside Postgres anyway).
// ---------------------------------------------------------------------------
/** Treasurer records a cash / UPI-online payment manually → pending_verification. */
export async function recordPayment(input: {
  memberId: string;
  amountRupees: string;
  monthRef: string; // '' = voluntary gift (no month)
  method: PaymentMethod;
  note: string;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== 'treasurer') return { ok: false, error: 'Only the treasurer can record fund entries.' };
  const amount = parseRupeesToPaise(input.amountRupees);
  if (amount === null) return { ok: false, error: 'Enter a valid amount above ₹0.' };
  if (input.monthRef && !/^\d{4}-\d{2}$/.test(input.monthRef))
    return { ok: false, error: 'Bad month reference.' };
  if (!UUID_RE.test(input.memberId)) return { ok: false, error: 'Choose the member who paid.' };
  if (input.method !== 'cash' && input.method !== 'upi_online')
    return { ok: false, error: 'Payment must be marked Cash or UPI/Online.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('record_contribution_as_treasurer', {
    p_member: input.memberId,
    p_amount: amount,
    p_month: input.monthRef || null,
    p_method: input.method,
    p_note: input.note.trim() || null,
  });
  if (error) {
    const msg = error.message ?? '';
    if (/duplicate key/.test(msg))
      return { ok: false, error: 'That member already has an entry for this month & amount. Check the ledger before adding a duplicate.' };
    return { ok: false, error: friendlyError(msg) || 'Could not record the payment.' };
  }
  revalidatePath('/fund');
  return { ok: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function friendlyError(msg: string): string | null {
  if (/only the treasurer/i.test(msg)) return 'Only the treasurer can do this.';
  if (/positive/.test(msg)) return 'Amount must be above ₹0.';
  return null;
}

// ---------------------------------------------------------------------------
// Treasurer flows (the DB functions enforce the role + transitions anyway)
// ---------------------------------------------------------------------------
async function rpc(name: string, args: Record<string, unknown>): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== 'treasurer') return { ok: false, error: 'Only the treasurer can do this.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: friendlyError(error.message ?? '') ?? error.message.replace(/^.*?: /, '') };
  revalidatePath('/fund');
  return { ok: true };
}

export async function verifyContribution(id: string, ref: string): Promise<ActionResult> {
  if (ref.trim().length < 3)
    return { ok: false, error: 'A reference is required — UPI/RRN number, or “CASH · voucher no.” for cash.' };
  return rpc('verify_contribution', { p_id: id, p_bank_ref: ref.trim() });
}

export async function rejectContribution(id: string, reason: string): Promise<ActionResult> {
  return rpc('reject_contribution', { p_id: id, p_reason: reason });
}

export async function reverseContribution(id: string, note: string): Promise<ActionResult> {
  return rpc('reverse_contribution', { p_id: id, p_note: note });
}

export async function approveExpense(id: string): Promise<ActionResult> {
  return rpc('approve_expense', { p_id: id });
}

export async function rejectExpense(id: string, reason: string): Promise<ActionResult> {
  return rpc('reject_expense', { p_id: id, p_reason: reason });
}

export async function reverseExpense(id: string, note: string): Promise<ActionResult> {
  return rpc('reverse_expense', { p_id: id, p_note: note });
}

/** Disburse: uploads receipt file to private bucket first, then pays via RPC. */
export async function payExpense(input: {
  id: string;
  bankRef: string;
  receiptFile: File | null;
  existingReceiptPath?: string | null;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (input.bankRef.trim().length < 3)
    return { ok: false, error: 'Bank reference is required.' };

  const supabase = await createClient();
  let receiptPath = input.existingReceiptPath ?? null;

  if (input.receiptFile && input.receiptFile.size > 0) {
    if (input.receiptFile.size > 5 * 1024 * 1024)
      return { ok: false, error: 'Receipt file must be under 5 MB.' };
    const ext = input.receiptFile.type === 'application/pdf' ? '.pdf' : '.jpg';
    receiptPath = `${profile.id}/${crypto.randomUUID()}${ext}`;
    const { error: upErr } = await supabase.storage
      .from('receipts')
      .upload(receiptPath, input.receiptFile, { contentType: input.receiptFile.type });
    if (upErr) return { ok: false, error: 'Receipt upload failed (treasurer only).' };
  }
  if (!receiptPath) return { ok: false, error: 'A receipt is required before paying.' };

  return rpc('pay_expense', {
    p_id: input.id,
    p_bank_ref: input.bankRef.trim(),
    p_receipt_path: receiptPath,
  });
}

/** The treasurer records an expense (manual entry only). Lands as 'submitted'. */
export async function submitExpenseRequest(input: {
  title: string;
  purpose: string;
  amountRupees: string;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== 'treasurer') return { ok: false, error: 'Only the treasurer can record expenses.' };
  if (input.title.trim().length < 2) return { ok: false, error: 'Give the expense a title.' };
  const amount = parseRupeesToPaise(input.amountRupees);
  if (amount === null) return { ok: false, error: 'Enter a valid amount.' };

  const supabase = await createClient();
  const { error } = await supabase.from('expenses').insert({
    title: input.title.trim(),
    purpose: input.purpose.trim() || null,
    amount_paise: amount,
    requested_by: profile.id,
  });
  if (error) return { ok: false, error: 'Could not record the expense.' };
  revalidatePath('/fund');
  return { ok: true };
}
