import type { FamilyRole } from './types';

/**
 * Mission Fund writes. Mirrors `public.can_write_fund()` (migration 0017),
 * which reads `profiles.role` for the signed-in person: `treasurer` or `admin`.
 * A unit-membership role of treasurer does not grant this. Admins assign it
 * on the member screen. Every other signed-in role is view-only.
 */
export function canWriteFund(role: FamilyRole): boolean {
  return role === 'treasurer' || role === 'admin';
}

export const FUND_WRITE_DENIED =
  'Only a treasurer or an admin can change fund entries.';
