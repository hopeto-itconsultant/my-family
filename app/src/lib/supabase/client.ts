'use client';
import { createBrowserClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/** Browser client using ONLY the public anon key. RLS enforces permissions. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
