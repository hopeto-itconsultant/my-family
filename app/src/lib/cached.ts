import 'server-only';
import {
  getBranchesOnce,
  getDirectoryOnce,
  getRelationsOnce,
  getUpcomingEventsOnce,
} from '@/lib/per-request';

/**
 * Directory, branches, tree edges, and the upcoming-events window are read
 * with the signed-in member's cookie session so Postgres RLS applies.
 *
 * `unstable_cache` cannot call `cookies()` / `headers()`. These queries go
 * through the cookie-based Supabase client, and the rows are user-scoped, so
 * they stay on the per-request React cache in `lib/per-request.ts` instead of
 * a cross-request cache. Server Actions still call `updateTag` after writes
 * for any future tagged cache; nothing here is stored under those tags.
 */
export const getCachedDirectory = getDirectoryOnce;
export const getCachedBranches = getBranchesOnce;
export const getCachedRelations = getRelationsOnce;
export const getCachedUpcomingEvents = getUpcomingEventsOnce;
