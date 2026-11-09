'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { updateMember, resetMemberPassword, linkDirectoryAccount } from '@/app/actions/members';
import { IssuedPassword } from '@/components/issued-password';
import { formatNicknames } from '@/lib/nicknames';
import {
  DEFAULT_PASSWORD_RULE,
  MIN_AUTH_PASSWORD_LENGTH,
  defaultMemberPassword,
} from '@/lib/default-password';
import type { Branch, FamilyRole, Profile } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/types';

const ROLES: FamilyRole[] = ['member', 'treasurer', 'admin'];

/** '2000-07-31' or '07-31' → '31/07' (day/month). */
function dayMonthLabel(hint: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(hint);
  if (iso) return `${iso[3]}/${iso[2]}`;
  const md = /^(\d{1,2})-(\d{1,2})$/.exec(hint);
  if (md) return `${md[2].padStart(2, '0')}/${md[1].padStart(2, '0')}`;
  return hint;
}

const inputCls =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-teal-600';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1 mt-4';

export function EditMemberForm({
  member,
  branches,
  needsLogin,
}: {
  member: Profile;
  branches: Branch[];
  /** Directory-only relative: no auth user yet, so linking creates the login. */
  needsLogin: boolean;
}) {
  const [state, action, pending] = useActionState(updateMember, null);
  const [pwState, pwAction, pwPending] = useActionState(resetMemberPassword, null);
  const [linkState, linkAction, linkPending] = useActionState(linkDirectoryAccount, null);
  const standard = defaultMemberPassword(member.full_name, {
    birthDate: member.birth_date,
    birthdayHint: member.birthday_hint,
  });

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
        {!member.birth_date && member.birthday_hint ? (
          <p className="text-xs text-stone-500 mt-1">
            Day and month on file, year unknown: {dayMonthLabel(member.birthday_hint)} (day/month).
            The standard password uses that. Save a full birth date here if you learn the year.
          </p>
        ) : null}

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

      {needsLogin ? (
        <section className="rounded-xl bg-white ring-1 ring-stone-200 p-4">
          <h2 className="font-semibold text-sm">Link a login</h2>
          <p className="text-xs text-stone-500 mt-1 mb-2">
            This relative is in the directory but has no account. Adding their mobile number creates a login
            on this same record. {DEFAULT_PASSWORD_RULE}{' '}
            {standard ? (
              <>
                Leave the password empty to use <span className="font-mono font-semibold text-stone-700">{standard}</span>.
              </>
            ) : (
              <>No birthday is saved, so type a password of at least {MIN_AUTH_PASSWORD_LENGTH} characters.</>
            )}{' '}
            Uses the name and birthday already saved — save profile changes first if you just edited them.
          </p>
          {linkState?.ok && linkState.password ? (
            <IssuedPassword
              password={linkState.password}
              title={
                linkState.usedDefault
                  ? `Login created for ${linkState.fullName ?? member.full_name}. Standard password:`
                  : `Login created for ${linkState.fullName ?? member.full_name}. Temporary password:`
              }
            />
          ) : (
            <form action={linkAction} className="space-y-2">
              <input type="hidden" name="id" value={member.id} />
              {linkState?.error ? (
                <p role="alert" className="rounded-lg bg-red-50 ring-1 ring-red-200 p-2 text-sm text-red-800">{linkState.error}</p>
              ) : null}
              <label className={labelCls} htmlFor="link_phone">Mobile number (login ID) *</label>
              <input
                id="link_phone"
                name="phone"
                required
                inputMode="numeric"
                pattern="[0-9 +\-]{10,15}"
                defaultValue={member.phone ?? ''}
                placeholder="10-digit number"
                className={inputCls}
              />
              <label className={labelCls} htmlFor="link_password">
                Temporary password {standard ? '(optional)' : '*'}
              </label>
              <input
                id="link_password"
                name="new_password"
                type="text"
                required={!standard}
                minLength={MIN_AUTH_PASSWORD_LENGTH}
                autoComplete="off"
                spellCheck={false}
                placeholder={standard ? `Leave blank to use ${standard}` : `At least ${MIN_AUTH_PASSWORD_LENGTH} characters`}
                className={inputCls}
              />
              <button
                type="submit"
                disabled={linkPending}
                className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {linkPending ? 'Creating login…' : 'Create login'}
              </button>
            </form>
          )}
        </section>
      ) : (
        <section className="rounded-xl bg-white ring-1 ring-stone-200 p-4">
          <h2 className="font-semibold text-sm">Reset password</h2>
          <p className="text-xs text-stone-500 mt-1 mb-2">
            They still sign in with their mobile number. {DEFAULT_PASSWORD_RULE}{' '}
            {standard ? (
              <>
                Leave the box empty to set <span className="font-mono font-semibold text-stone-700">{standard}</span>,
                or type a different password (at least {MIN_AUTH_PASSWORD_LENGTH} characters).
              </>
            ) : (
              <>No birthday is saved, so a standard password cannot be made. Enter one of at least {MIN_AUTH_PASSWORD_LENGTH} characters.</>
            )}{' '}
            This uses the name and birthday already saved — save profile changes first if you just edited them.
          </p>
          <form action={pwAction} className="space-y-2">
            <input type="hidden" name="id" value={member.id} />
            {pwState?.error ? (
              <p role="alert" className="rounded-lg bg-red-50 ring-1 ring-red-200 p-2 text-sm text-red-800">{pwState.error}</p>
            ) : null}
            {pwState?.ok && pwState.password ? (
              <IssuedPassword
                password={pwState.password}
                title={pwState.usedDefault ? 'Password reset to the standard password.' : 'Password reset to the one you typed.'}
              />
            ) : null}
            <input
              name="new_password"
              type="text"
              required={!standard}
              minLength={MIN_AUTH_PASSWORD_LENGTH}
              autoComplete="off"
              spellCheck={false}
              placeholder={standard ? `Leave blank for ${standard}` : `Temporary password (at least ${MIN_AUTH_PASSWORD_LENGTH} characters)`}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={pwPending}
              className="w-full rounded-xl ring-1 ring-teal-700 text-teal-800 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {pwPending ? 'Resetting…' : standard ? 'Reset password' : 'Set password'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
