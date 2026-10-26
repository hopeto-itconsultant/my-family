import { redirect } from 'next/navigation';
import { getCachedDirectory, getCachedBranches, getCachedRelations, getCachedUpcomingEvents } from '@/lib/cached';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import type { Branch, FamilyEvent, FamilyRelation, Profile, ProfileWithBranch } from '@/lib/types';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>['profile']>;

/** Steward roles (post-merge of coordinator into treasurer — migration 0013):
 * treasurers manage the tree/events/history AND record every Mission Fund
 * entry manually; admins keep oversight. Mirrors RLS (`is_steward()`). */
export function canManage(rel: Pick<Profile, 'role'>): boolean {
  return rel.role === 'treasurer' || rel.role === 'admin';
}

/** Server-side session helper used by every protected page. */
export async function getSession() {
  if (!isSupabaseConfigured()) return { profile: null as Profile | null, configured: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profile: null as Profile | null, configured: true };

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { profile: (data ?? null) as Profile | null, configured: true };
}

export async function requireProfile(): Promise<Profile> {
  const { profile, configured } = await getSession();
  if (!configured) redirect('/setup');
  if (!profile) redirect('/login');
  return profile;
}

/** Directory — served via the short route cache (lib/cached); writes call
 * revalidatePath('/directory'|'/members'), so edits appear immediately. */
export async function getDirectory(): Promise<ProfileWithBranch[]> {
  return getCachedDirectory();
}

/** All family branches (route-cached ~10 min; branch names change rarely). */
export async function getBranches(): Promise<Branch[]> {
  return getCachedBranches();
}

/** Relation edges — route-cached ~2 min; tree actions revalidatePath('/tree'). */
export async function getRelations(): Promise<FamilyRelation[]> {
  return getCachedRelations() as Promise<FamilyRelation[]>;
}

/** Upcoming events window — route-cached ~5 min; event actions revalidate. */
export async function getUpcomingEvents(days = 45): Promise<FamilyEvent[]> {
  return getCachedUpcomingEvents(days) as Promise<FamilyEvent[]>;
}

/** In-app reminders for the signed-in member (RLS: only own rows are visible). */
export type AppNotification = {
  id: string;
  kind: 'event' | 'fund' | 'system';
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

export async function getMyNotifications(limit = 12): Promise<AppNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, link, created_at, read_at')
    .eq('user_id', user.id)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as AppNotification[];
}
