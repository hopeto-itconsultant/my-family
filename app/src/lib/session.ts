import { cache } from 'react';
import { redirect } from 'next/navigation';
import {
  getCachedDirectory,
  getCachedBranches,
  getCachedEvents,
  getCachedMemberNames,
  getCachedRelations,
  getCachedUpcomingEvents,
} from '@/lib/cached';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import type { Branch, FamilyEvent, FamilyRelation, Profile, ProfileWithBranch } from '@/lib/types';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>['profile']>;

/** Steward roles (post-merge of coordinator into treasurer — migration 0015):
 * treasurers manage the tree/events/history AND record every Mission Fund
 * entry manually; admins keep oversight. Mirrors RLS (`is_steward()`). */
export function canManage(rel: Pick<Profile, 'role'>): boolean {
  return rel.role === 'treasurer' || rel.role === 'admin';
}

/**
 * One auth check and one profile read per request. The layout and the page
 * both call this; without `cache()` each call was its own `getUser()` round
 * trip to Supabase.
 */
export const getSession = cache(async () => {
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
});

export async function requireProfile(): Promise<Profile> {
  const { profile, configured } = await getSession();
  if (!configured) redirect('/setup');
  if (!profile) redirect('/login');
  return profile;
}

/** Directory — per-request only. The cookie session cannot be read inside
 * `unstable_cache`, and RLS makes the rows user-scoped. */
export async function getDirectory(): Promise<ProfileWithBranch[]> {
  return getCachedDirectory();
}

/** All family branches visible to this member (per-request). */
export async function getBranches(): Promise<Branch[]> {
  return getCachedBranches();
}

/** id + name only, for labelling events. */
export async function getMemberNames(): Promise<{ id: string; full_name: string }[]> {
  return getCachedMemberNames();
}

/** Relation edges for this member (per-request). */
export async function getRelations(): Promise<FamilyRelation[]> {
  return getCachedRelations();
}

/** Upcoming events window for this member (per-request). */
export async function getUpcomingEvents(days = 45): Promise<FamilyEvent[]> {
  return getCachedUpcomingEvents(days);
}

/** All events this member can read (per-request). Used by the month calendar. */
export async function getEvents(): Promise<FamilyEvent[]> {
  return getCachedEvents();
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
  const { profile } = await getSession();
  if (!profile) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, link, created_at, read_at')
    .eq('user_id', profile.id)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as AppNotification[];
}
