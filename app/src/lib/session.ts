import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import type { Profile, ProfileWithBranch } from '@/lib/types';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>['profile']>;

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
