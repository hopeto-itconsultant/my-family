'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createMember } from '@/app/actions/members';
import { formatNicknames } from '@/lib/nicknames';
import type { Branch, FamilyRole } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/types';

const ROLES: FamilyRole[] = ['member', 'coordinator', 'treasurer', 'admin'];

const inputCls =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-teal-600';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1 mt-4';

export function NewMemberForm({ branches }: { branches: Branch[] }) {
  const [state, action, pending] = useActionState(createMember, null);

  return (
    <form action={action} className="space-y-1">
      {state?.error && (
        <p role="alert" className="rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <label className={labelCls} htmlFor="full_name">Full name *</label>
      <input id="full_name" name="full_name" required autoComplete="name" className={inputCls} placeholder="e.g. Ravi Kumar" />

      <label className={labelCls} htmlFor="nicknames">Nicknames / pet names</label>
      <input id="nicknames" name="nicknames" className={inputCls} placeholder="comma-separated, e.g. Appa, Annachi, Kanna" />
      <p className="text-xs text-stone-500 mt-1">Separate multiple names with commas (max 10).</p>

      <label className={labelCls} htmlFor="phone">Mobile number (login ID) *</label>
      <input id="phone" name="phone" required inputMode="numeric" pattern="[0-9 +\-]{10,15}" className={inputCls} placeholder="10-digit number" />
      <p className="text-xs text-stone-500 mt-1">They will sign in with this number and the password below.</p>

      <label className={labelCls} htmlFor="temp_password">Temporary password *</label>
      <input id="temp_password" name="temp_password" type="text" required minLength={8} className={inputCls} placeholder="Min. 8 characters — share it in person" />

      <label className={labelCls} htmlFor="branch_id">Family branch</label>
      <select id="branch_id" name="branch_id" className={inputCls} defaultValue="">
        <option value="">— Unassigned —</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>

      <label className={labelCls} htmlFor="role">Role</label>
      <select id="role" name="role" className={inputCls} defaultValue="member">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}{r === 'treasurer' ? ' (only one allowed)' : ''}{r === 'admin' ? ' (full account control)' : ''}
          </option>
        ))}
      </select>

      <label className={labelCls} htmlFor="birth_date">Full birth date (optional)</label>
      <input id="birth_date" name="birth_date" type="date" className={inputCls} max={new Date().toISOString().slice(0, 10)} />

      <label className={labelCls} htmlFor="birth_year">Birth year (optional)</label>
      <input id="birth_year" name="birth_year" inputMode="numeric" pattern="\d{4}" maxLength={4} className={inputCls} placeholder="e.g. 1948 — use when only the year is known" />
      <p className="text-xs text-stone-500 mt-1">If the full date is given, the year is taken from it automatically.</p>

      <label className={labelCls} htmlFor="date_of_death">Date of death (optional)</label>
      <input id="date_of_death" name="date_of_death" type="date" className={inputCls} />

      <label className={labelCls} htmlFor="anniversary_date">Wedding anniversary (optional)</label>
      <input id="anniversary_date" name="anniversary_date" type="date" className={inputCls} />

      <div className="pt-5 flex gap-3">
        <Link href="/members" className="rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ring-stone-300 bg-white">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </div>

      <p className="text-xs text-stone-500 pt-2">
        Creating an account does not record any money or activity for them — it
        only grants access. Every creation is written to the audit log.
      </p>
    </form>
  );
}
