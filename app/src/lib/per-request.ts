import 'server-only';
import { cache as reactCache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Branch, FamilyEvent, FamilyRelation, ProfileWithBranch } from '@/lib/types';

/**
 * Per-request data cache (React `cache()`): if several components in one page
 * render need the directory/branches/tree, Supabase is hit ONCE per request.
 * This is the safe, always-fresh layer — it never crosses requests and never
 * bypasses RLS (the client is still the signed-in member's cookie session).
 *
 * The longer-lived route cache lives in lib/cached.ts.
 */

export const getDirectoryOnce = reactCache(async (): Promise<ProfileWithBranch[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*, branches ( id, name )')
    .order('full_name');
  if (error || !data) return [];
  return data as unknown as ProfileWithBranch[];
});

/** Names for the events page. Skips the full profile row the directory needs. */
export const getMemberNamesOnce = reactCache(async (): Promise<{ id: string; full_name: string }[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select('id, full_name').order('full_name');
  if (error || !data) return [];
  return data as { id: string; full_name: string }[];
});

export const getBranchesOnce = reactCache(async (): Promise<Branch[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, order_hint')
    .order('order_hint');
  if (error || !data) return [];
  return data as Branch[];
});

export const getRelationsOnce = reactCache(async (): Promise<FamilyRelation[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('family_relations')
    .select('id, from_member, to_member, kind');
  if (error || !data) return [];
  return data as FamilyRelation[];
});

const EVENT_COLUMNS = 'id, kind, title, occurs_on, member_id, branch_id, venue, notes';

export const getUpcomingEventsOnce = reactCache(
  async (days = 45): Promise<FamilyEvent[]> => {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    const until = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    })();
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .gte('occurs_on', today)
      .lte('occurs_on', until)
      .order('occurs_on');
    if (error || !data) return [];
    return data as FamilyEvent[];
  },
);

/**
 * Every event the member can read (RLS `events_read`). Same columns as the
 * upcoming window. The calendar needs the full set because birthdays and
 * anniversaries store only the next occurrence's year — the month view
 * projects that month/day onto the year on screen.
 */
export const getEventsOnce = reactCache(async (): Promise<FamilyEvent[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .order('occurs_on');
  if (error || !data) return [];
  return data as FamilyEvent[];
});
