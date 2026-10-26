import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireProfile, getDirectory } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { MEMBERSHIP_ROLE_LEVEL, type MembershipRole } from '@/lib/access';
import { RosterManager, type RosterRow } from './roster-manager';

export const metadata = { title: 'Unit · Our Family Home' };

/** Unit detail + roster. Access: RLS returns the unit row only if it exists;
 *  memberships are visible only to co-members (unit_memberships_select), so a
 *  non-member sees an empty roster and cannot manage anything (level 0). */
export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from('org_units')
    .select('id, kind, name, description, scope, status, parent_id')
    .eq('id', id)
    .maybeSingle();
  if (!unit) notFound();

  const { data: rosterRaw } = await supabase
    .from('unit_memberships')
    .select('id, member_id, member_role, status, profiles ( full_name )')
    .eq('unit_id', id)
    .order('member_role');

  const roster: RosterRow[] = (rosterRaw ?? []).map((r) => ({
    membership_id: r.id as string,
    member_id: r.member_id as string,
    full_name: ((r.profiles as { full_name?: string })?.full_name ?? 'Unknown'),
    member_role: r.member_role as MembershipRole,
    status: r.status as RosterRow['status'],
  }));

  const mine = roster.find((r) => r.member_id === profile.id);
  let myLevel = profile.role === 'admin' ? 7 : mine && mine.status === 'active'
    ? MEMBERSHIP_ROLE_LEVEL[mine.member_role] ?? 0
    : 0;

  const people = (await getDirectory()).map((p) => ({ id: p.id, full_name: p.full_name }));

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <Link href="/units" className="text-sm text-teal-700 underline">← My units</Link>
      <div>
        <h1 className="text-xl font-bold">
          <span aria-hidden className="mr-1">{unit.kind === 'branch' ? '🌳' : '👥'}</span>
          {unit.name}
        </h1>
        {unit.description && <p className="text-sm text-stone-500 mt-1">{unit.description}</p>}
        <p className="text-xs text-stone-400 mt-1 capitalize">
          {unit.kind} · scope: {unit.scope.replace('_', ' ')} · {unit.status}
          {mine ? ` · you: ${mine.member_role} (${mine.status})` : ' · you: no membership'}
        </p>
      </div>

      {myLevel === 0 && (
        <p className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900">
          You are not an active member of this unit, so its roster is hidden and
          nothing here can be changed. Ask a unit administrator for access.
        </p>
      )}

      <RosterManager unitId={unit.id} roster={roster} people={people} myLevel={myLevel} myId={profile.id} />

      {profile.role === 'admin' && (
        <p className="text-[11px] text-stone-400">
          Admin note: branches are renamed/archived via SQL until the admin console ships
          (Phase 6). Membership changes made here are recorded in the append-only audit log.
        </p>
      )}
    </div>
  );
}
