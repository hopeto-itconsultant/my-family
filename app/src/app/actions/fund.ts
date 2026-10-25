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
// Member flows — ALWAYS go through the guarded DB functions. A member can
// never insert money as "verified": the state machine lives in Postgres.
// ---------------------------------------------------------------------------
/** Record a bank/UPI payment manually → stored as pending_verification. */
export async function recordPayment(input: {
  amountRupees: string;
  monthRef: string; // '' = voluntary gift (no month)
  method: PaymentMethod;
  referenceHint: string; // e.g. UPI ref shown to treasurer (not proof!)
  note: string;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  const amount = parseRupeesToPaise(input.amountRupees);
  if (amount === null) return { ok: false, error: 'Enter a valid amount above ₹0.' };
  if (input.monthRef && !/^\d{4}-\d{2}$/.test(input.monthRef))
    return { ok: false, error: 'Bad month reference.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('declare_contribution', {
    p_amount: amount,
    p_month: input.monthRef || null,
    p_method: input.method,
    p_note: [input.referenceHint.trim(), input.note.trim()].filter(Boolean).join(' · ') || null,
  });
  if (error) return { ok: false, error: 'Could not record the payment.' };

  // Immediately move it to pending_verification ("money sent") via the RPC,
  // so it sits in the treasurer's queue — still NOT counted as received.
  const { data: mine } = await supabase
    .from('contributions')
    .select('id')
    .eq('member_id', profile.id)
    .eq('status', 'declared')
    .order('declared_at', { ascending: false })
    .limit(1);
  if (mine?.[0]?.id) {
    await supabase.rpc('mark_contribution_sent', { p_id: mine[0].id });
  }
  revalidatePath('/fund');
  return { ok: true };
}

/** Withdraw an unverified declaration (rejected w/ reason; never touches balance). */
export async function withdrawDeclaration(id: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from('contributions')
    .update({ status: 'rejected', reject_reason: 'Withdrawn by member before verification' })
    .eq('id', id)
    .eq('member_id', profile.id)
    .in('status', ['declared', 'pending_verification']);
  if (error) return { ok: false, error: 'Only unverified declarations can be withdrawn.' };
  revalidatePath('/fund');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Treasurer flows (the DB functions enforce the role + transitions anyway)
// ---------------------------------------------------------------------------
async function rpc(name: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: error.message.replace(/^.*?: /, '') };
  revalidatePath('/fund');
  return { ok: true };
}

export async function verifyContribution(id: string, bankRef: string): Promise<ActionResult> {
  if (bankRef.trim().length < 3)
    return { ok: false, error: 'Bank/UPI reference is required to verify.' };
  return rpc('verify_contribution', { p_id: id, p_bank_ref: bankRef.trim() });
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

/** Any member may submit an expense request (lands as 'submitted'). */
export async function submitExpenseRequest(input: {
  title: string;
  purpose: string;
  amountRupees: string;
}): Promise<ActionResult> {
  const profile = await requireProfile();
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
  if (error) return { ok: false, error: 'Could not submit the request.' };
  revalidatePath('/fund');
  return { ok: true };
}
