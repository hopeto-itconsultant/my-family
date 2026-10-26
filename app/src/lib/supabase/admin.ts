import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/**
 * Server-only admin client using the service-role key.
 *
 * ⚠ Bypasses RLS — import ONLY from Server Actions that enforce role checks
 * themselves (see app/src/app/actions/members.ts). The key must exist solely
 * in server environment variables (SUPABASE_SERVICE_ROLE_KEY); it must never
 * be prefixed NEXT_PUBLIC_ or shipped to the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Member creation needs it on the server.',
    );
  }
  return createSupabaseClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export { supabaseAnonKey };
