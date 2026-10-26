import Link from 'next/link';
import { requireProfile } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sortUnits } from '@/lib/access';
import type { UnitScope, UnitKind } from '@/lib/access';

export const metadata = { title: 'Branches & groups · Our Family Home' };

interface UnitRow {
  id: string;
  kind: UnitKind;
  name: string;
  description: string | null;
  scope: UnitScope;
  status: 'active' | 'archived';
  member_role: string;
}

/** "My units" — branches + divisions the signed-in person belongs to.
 *  RLS on unit_memberships guarantees only real memberships appear here. */
export default async function UnitsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from('my_units')
    .select('id, kind, name, description, scope, status, member_role');
  const units = sortUnits((data ?? []) as UnitRow[]);

  const canCreate = profile.role === 'admin' || profile.role === 'treasurer';

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold">My branches &amp; groups</h1>
      <p className="text-sm text-stone-500">
        Branches are family lines; groups/divisions (youth fellowship, committees…)
        are separate memberships. Belonging to one does <em>not</em> grant access to
        another&rsquo;s private resources or funds.
      </p>

      {canCreate && (
        <Link
          href="/units/new"
          className="inline-block rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow active:bg-teal-800"
        >
          + New group / division
        </Link>
      )}

      {units.length === 0 ? (
        <p className="rounded-xl bg-stone-100 p-4 text-sm text-stone-600">
          You have no branch or group memberships yet. Your home branch was set when
          your account was created — ask an administrator if something is missing.
        </p>
      ) : (
        <ul className="space-y-2">
          {units.map((u) => (
            <li key={u.id} className="rounded-xl bg-white ring-1 ring-stone-200">
              <Link href={`/units/${u.id}`} className="block p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">
                    <span aria-hidden className="mr-1">{u.kind === 'branch' ? '🌳' : '👥'}</span>
                    {u.name}
                  </p>
                  <span className="shrink-0 text-[11px] rounded-full bg-teal-50 text-teal-800 px-2 py-0.5 capitalize ring-1 ring-teal-200">
                    {u.member_role}
                  </span>
                </div>
                {u.description && (
                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{u.description}</p>
                )}
                {u.status === 'archived' && (
                  <p className="text-xs text-amber-700 mt-0.5">Archived — kept for history.</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
