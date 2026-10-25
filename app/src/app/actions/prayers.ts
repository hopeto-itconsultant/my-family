'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, canManage } from '@/lib/session';
import type { Achievement, PrayerRequest } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRAYER_FIELDS =
  'id, member_id, branch_id, title, detail, is_private, status, answered_note, created_at, updated_at';
const ACHIEVEMENT_FIELDS =
  'id, member_id, branch_id, kind, title, detail, achieved_on, created_by, created_at';

// ---------------------------------------------------------------------------
// Prayers
// ---------------------------------------------------------------------------
export async function getPrayers(): Promise<PrayerRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('prayer_requests')
    .select(PRAYER_FIELDS)
    .order('status')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as PrayerRequest[];
}

/** RLS: member_id must be the caller — people post under their own name. */
export async function submitPrayer(input: {
  title: string;
  detail: string;
  isPrivate: boolean;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  const title = input.title.trim();
  if (title.length < 2 || title.length > 160)
    return { ok: false, error: 'Title should be 2–160 characters.' };

  const supabase = await createClient();
  const { error } = await supabase.from('prayer_requests').insert({
    member_id: profile.id,
    branch_id: profile.branch_id,
    title,
    detail: input.detail.trim() || null,
    is_private: input.isPrivate,
  });
  if (error) return { ok: false, error: 'Could not save the prayer request.' };
  revalidatePath('/prayers');
  return { ok: true };
}

/** Owner marks their own request answered (with a short testimony note). */
export async function markPrayerAnswered(id: string, note: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from('prayer_requests')
    .update({ status: 'answered', answered_note: note.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('member_id', profile.id);
  if (error) return { ok: false, error: 'Only the author can mark a prayer answered.' };
  revalidatePath('/prayers');
  return { ok: true };
}

/** Leaders may lift an answered note or moderate (RLS enforced). */
export async function leaderUpdatePrayer(
  id: string,
  patch: Partial<Pick<PrayerRequest, 'status' | 'answered_note'>>,
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!canManage(profile)) return { ok: false, error: 'Leaders only.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('prayer_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: 'Update failed (permission).' };
  revalidatePath('/prayers');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export async function getAchievements(limit = 60): Promise<Achievement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('achievements')
    .select(ACHIEVEMENT_FIELDS)
    .order('achieved_on', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as Achievement[];
}

export async function addAchievement(input: {
  memberId: string;
  kind: string;
  title: string;
  detail: string;
  achievedOn: string; // YYYY-MM-DD
}): Promise<ActionResult> {
  const profile = await requireProfile();
  const title = input.title.trim();
  if (title.length < 2) return { ok: false, error: 'Give the achievement a short title.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.achievedOn))
    return { ok: false, error: 'Choose the date it happened.' };

  const supabase = await createClient();
  const { error } = await supabase.from('achievements').insert({
    member_id: input.memberId,
    kind: input.kind,
    title,
    detail: input.detail.trim() || null,
    achieved_on: input.achievedOn,
    created_by: profile.id,
  });
  if (error) return { ok: false, error: 'Could not save (check the form and try again).' };
  revalidatePath('/prayers');
  return { ok: true };
}
