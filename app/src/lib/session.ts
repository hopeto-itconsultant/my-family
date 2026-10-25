import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import type { FamilyEvent, FamilyRelation, Profile, ProfileWithBranch } from '@/lib/types';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>['profile']>;

/** Roles that may maintain the tree / schedule events (mirrors RLS). */
export function canManage(rel: Pick<Profile, 'role'>): boolean {
  return rel.role === 'coordinator' || rel.role === 'treasurer' || rel.role === 'admin';
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

export async function getDirectory(): Promise<ProfileWithBranch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*, branches ( id, name )')
    .order('full_name');
  if (error || !data) return [];
  return data as unknown as ProfileWithBranch[];
}

/** All relation edges (RLS: readable by any signed-in relative). */
export async function getRelations(): Promise<FamilyRelation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('family_relations')
    .select('id, from_member, to_member, kind');
  if (error || !data) return [];
  return data as FamilyRelation[];
}

/** Upcoming events within the next `days` days (plus anything undated-past for meetups). */
export async function getUpcomingEvents(days = 45): Promise<FamilyEvent[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const until = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  })();
  const { data, error } = await supabase
    .from('events')
    .select('id, kind, title, occurs_on, member_id, branch_id, venue, notes')
    .gte('occurs_on', today)
    .lte('occurs_on', until)
    .order('occurs_on');
  if (error || !data) return [];
  return data as FamilyEvent[];
}
