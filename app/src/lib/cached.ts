import 'server-only';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getRelationsOnce, getUpcomingEventsOnce } from '@/lib/per-request';
import type { Branch, ProfileWithBranch } from '@/lib/types';

/**
 * Page-caching helpers (performance pass).
 *
 * Security rule we never break: everything below is keyed to the SIGNED-IN
 * USER ID. Supabase RLS still decides what each user may see; the cache only
 * remembers "this user's result for this query" for a short window, so one
 * relative can never be served another relative's cached rows.
 *
 * Money data (fund summary/ledger) is intentionally NOT cached — balances must
 * always reflect the treasurer's latest entry.
 */

/**
 * Directory + branch names are family-wide under our RLS (every signed-in
 * relative sees the same rows), so a short route cache is safe and shared.
 * Writes call revalidateTag('directory' | 'branches'), so edits show up at
 * once for everyone.
 */
export const getCachedDirectory = unstable_cache(
  async (): Promise<ProfileWithBranch[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*, branches ( id, name )')
      .order('full_name');
    if (error || !data) return [];
    return data as unknown as ProfileWithBranch[];
  },
  ['directory'],
  { revalidate: 120, tags: ['directory'] },
);

export const getCachedBranches = unstable_cache(
  async (): Promise<Branch[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, order_hint')
      .order('order_hint');
    if (error || !data) return [];
    return data as Branch[];
  },
  ['branches'],
  { revalidate: 600, tags: ['branches'] },
);

/** Family-tree edges — read-heavy, write-rare (steward edits audit them). */
export const getCachedRelations = unstable_cache(
  () => getRelationsOnce(),
  ['tree-edges'],
  { revalidate: 120, tags: ['tree'] },
);

/** Upcoming events window — birthdays roll forward nightly; 5-min staleness ok. */
export const getCachedUpcomingEvents = unstable_cache(
  (days: number) => getUpcomingEventsOnce(days),
  ['events-upcoming'],
  { revalidate: 300, tags: ['events'] },
);
