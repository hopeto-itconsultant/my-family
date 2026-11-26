import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/**
 * The signed-in admin or member, from the Supabase auth cookies. Never the
 * view-as preview. Sign-in, sign-out, and "am I an admin?" checks use this
 * so a preview cannot replace or drop the real session.
 */
export async function createActorClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component: safe to ignore when middleware
          // is refreshing sessions.
        }
      },
    },
  });
}

/**
 * Data client for pages and actions. During an admin "View as" preview this
 * is the member's read-only session, so Postgres RLS shows their rows.
 * Otherwise it is the cookie session.
 */
export async function createClient(): Promise<SupabaseClient> {
  const { getRequestClient } = await import('@/lib/view-as-session');
  const { client } = await getRequestClient();
  return client;
}
