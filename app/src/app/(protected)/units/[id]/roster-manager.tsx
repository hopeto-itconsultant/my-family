'use client';

import { useState, useTransition } from 'react';
import {
  grantMembership,
  updateMembership,
  removeMembership,
} from '@/app/actions/units';
import {
  MEMBERSHIP_ROLE_LABELS,
  grantableRoles,
  type MembershipRole,
  type MembershipStatus,
} from '@/lib/access';

export interface RosterRow {
  membership_id: string;
  member_id: string;
  full_name: string;
  member_role: MembershipRole;
  status: MembershipStatus;
}

/** Unit roster with inline management. `myLevel` only trims the role picker —
 *  the DB trigger + RLS are the actual enforcement (hiding ≠ security). */
export function RosterManager({
  unitId,
  roster,
  people,
  myLevel,
  myId,
}: {
  unitId: string;
  roster: RosterRow[];
  people: { id: string; full_name: string }[];
  myLevel: number;
  myId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState('');
  const [role, setRole] = useState<MembershipRole>('viewer');
  const removable = myLevel >= 6; // coordinator+ in this unit (or global admin mapped to 7)

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const res = await new Promise<{ ok: boolean; error?: string }>((resolve) =>
      start(async () => resolve(await fn())),
    );
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-800">{error}</p>
      )}

      {/* add a member */}
      {myLevel > 0 && (
        <div className="rounded-xl bg-white ring-1 ring-stone-200 p-3 space-y-2">
          <p className="text-sm font-semibold">Add member</p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="flex-1 min-w-[10rem] rounded-xl border border-stone-300 px-2 py-2 text-sm"
              aria-label="Relative"
            >
              <option value="">Choose relative…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MembershipRole)}
              className="rounded-xl border border-stone-300 px-2 py-2 text-sm"
              aria-label="Role"
            >
              {grantableRoles(myLevel).map((r) => (
                <option key={r} value={r}>{MEMBERSHIP_ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button
              disabled={!picked || pending}
              onClick={() => picked && run(() => grantMembership({ unitId, memberId: picked, role }))}
              className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <p className="text-[11px] text-stone-500">
            You can grant roles up to your own level ({myLevel}/7). The database enforces this again.
          </p>
        </div>
      )}

      {/* roster list */}
      <ul className="space-y-2">
        {roster.map((r) => (
          <li key={r.membership_id} className="rounded-xl bg-white ring-1 ring-stone-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium truncate">
                {r.full_name}
                {r.member_id === myId ? ' (you)' : ''}
              </p>
              <span
                className={
                  'shrink-0 text-[11px] rounded-full px-2 py-0.5 ring-1 ' +
                  (r.status === 'active'
                    ? 'bg-teal-50 text-teal-800 ring-teal-200'
                    : r.status === 'invited'
                      ? 'bg-sky-50 text-sky-800 ring-sky-200'
                      : 'bg-amber-50 text-amber-800 ring-amber-200')
                }
              >
                {r.status}
              </span>
            </div>

            {myLevel > 0 && r.member_id !== myId ? (
              <div className="mt-2 flex gap-2 flex-wrap items-center">
                <select
                  defaultValue={r.member_role}
                  disabled={pending}
                  onChange={(e) =>
                    run(() =>
                      updateMembership({
                        unitId,
                        membershipId: r.membership_id,
                        role: e.target.value as MembershipRole,
                      }),
                    )
                  }
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs"
                  aria-label={`Role for ${r.full_name}`}
                >
                  {grantableRoles(myLevel).map((x) => (
                    <option key={x} value={x}>{MEMBERSHIP_ROLE_LABELS[x]}</option>
                  ))}
                  {!grantableRoles(myLevel).includes(r.member_role) && (
                    <option value={r.member_role}>{MEMBERSHIP_ROLE_LABELS[r.member_role]} (current)</option>
                  )}
                </select>
                <select
                  defaultValue={r.status}
                  disabled={pending}
                  onChange={(e) =>
                    run(() =>
                      updateMembership({
                        unitId,
                        membershipId: r.membership_id,
                        status: e.target.value as MembershipStatus,
                      }),
                    )
                  }
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs capitalize"
                  aria-label={`Status for ${r.full_name}`}
                >
                  {(['invited', 'active', 'suspended', 'revoked'] as MembershipStatus[]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {removable && (
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Remove ${r.full_name} from this unit? Their access stops immediately.`)) return;
                      run(() => removeMembership({ unitId, membershipId: r.membership_id }));
                    }}
                    className="text-xs font-medium text-red-700 underline underline-offset-2 disabled:opacity-40"
                  >
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-stone-500 capitalize">{r.member_role} · {r.status}</p>
            )}
          </li>
        ))}
        {roster.length === 0 && (
          <li className="rounded-xl bg-stone-100 p-4 text-sm text-stone-600">No members yet.</li>
        )}
      </ul>
    </div>
  );
}
