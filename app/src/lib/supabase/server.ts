import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/**
 * Server Components / Server Actions client bound to the request's cookies.
 * All queries run as the logged-in family member, so Postgres RLS decides
 * what they can see or change — the app never bypasses it (except via an
 * explicit service-role admin path, which is deliberately not created here).
 */
export async function createClient() {
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
