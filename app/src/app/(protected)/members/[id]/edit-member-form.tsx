'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { updateMember, resetMemberPassword } from '@/app/actions/members';
import { formatNicknames } from '@/lib/nicknames';
import type { Branch, FamilyRole, Profile } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/types';

const ROLES: FamilyRole[] = ['member', 'treasurer', 'admin'];

const inputCls =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-teal-600';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1 mt-4';

export function EditMemberForm({
  member,
  branches,
}: {
  member: Profile;
  branches: Branch[];
}) {
  const [state, action, pending] = useActionState(updateMember, null);
  const [pwState, pwAction, pwPending] = useActionState(resetMemberPassword, null);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-1">
        <input type="hidden" name="id" value={member.id} />
        {state?.error && (
          <p role="alert" className="rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-800">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-3 text-sm text-emerald-800">
            Saved. The change is recorded in the audit log.
          </p>
        )}

        <label className={labelCls} htmlFor="full_name">Full name *</label>
        <input id="full_name" name="full_name" required defaultValue={member.full_name} className={inputCls} />

        <label className={labelCls} htmlFor="nicknames">Nicknames / pet names</label>
        <input id="nicknames" name="nicknames" className={inputCls}
          defaultValue={formatNicknames(member.nicknames)}
          placeholder="comma-separated, e.g. Appa, Annachi, Kanna" />
        <p className="text-xs text-stone-500 mt-1">Separate multiple names with commas (max 10).</p>

        <label className={labelCls} htmlFor="phone">Mobile number (login ID)</label>
        <input id="phone" name="phone" inputMode="numeric" pattern="[0-9 +\-]{10,15}"
          defaultValue={member.phone ?? ''} className={inputCls} />
        <p className="text-xs text-stone-500 mt-1">Changing this changes how they sign in.</p>

        <label className={labelCls} htmlFor="branch_id">Family branch</label>
        <select id="branch_id" name="branch_id" className={inputCls} defaultValue={member.branch_id ?? ''}>
          <option value="">— Unassigned —</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <label className={labelCls} htmlFor="role">Role</label>
        <select id="role" name="role" className={inputCls} defaultValue={member.role}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}{r === 'treasurer' ? ' (only one allowed)' : ''}
            </option>
          ))}
        </select>

        <label className={labelCls} htmlFor="birth_date">Full birth date</label>
        <input id="birth_date" name="birth_date" type="date" defaultValue={member.birth_date ?? ''} className={inputCls} max={new Date().toISOString().slice(0, 10)} />

        <label className={labelCls} htmlFor="birth_year">Birth year</label>
        <input id="birth_year" name="birth_year" inputMode="numeric" pattern="\d{4}" maxLength={4}
          defaultValue={member.birth_year ?? (member.birth_date ? member.birth_date.slice(0, 4) : '')}
          className={inputCls} placeholder="e.g. 1948 — use when only the year is known" />
        <p className="text-xs text-stone-500 mt-1">If the full date is given, the year is taken from it automatically.</p>

        <label className={labelCls} htmlFor="date_of_death">Date of death</label>
        <input id="date_of_death" name="date_of_death" type="date" defaultValue={member.date_of_death ?? ''} className={inputCls} />

        <label className={labelCls} htmlFor="anniversary_date">Wedding anniversary</label>
        <input id="anniversary_date" name="anniversary_date" type="date" defaultValue={member.anniversary_date ?? ''} className={inputCls} />

        <div className="pt-5 flex gap-3">
          <Link href="/members" className="rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ring-stone-300 bg-white">
            Back
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <section className="rounded-xl bg-white ring-1 ring-stone-200 p-4">
        <h2 className="font-semibold text-sm">Reset password</h2>
        <p className="text-xs text-stone-500 mt-1 mb-2">
          Give them a new temporary password. They still sign in with their mobile number.
        </p>
        <form action={pwAction} className="space-y-2">
          <input type="hidden" name="id" value={member.id} />
          {pwState?.error && (
            <p role="alert" className="rounded-lg bg-red-50 ring-1 ring-red-200 p-2 text-sm text-red-800">{pwState.error}</p>
          )}
          {pwState?.ok && (
            <p className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-2 text-sm text-emerald-800">Password reset.</p>
          )}
          <input name="new_password" type="text" required minLength={8} placeholder="New temporary password (min 8 chars)" className={inputCls} />
          <button
            type="submit"
            disabled={pwPending}
            className="w-full rounded-xl ring-1 ring-teal-700 text-teal-800 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {pwPending ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </section>
    </div>
  );
}
