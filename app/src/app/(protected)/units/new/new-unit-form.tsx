'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createUnit, type UnitActionState } from '@/app/actions/units';

const initial: UnitActionState = { ok: false };

export function NewUnitForm({ canCreateBranch }: { canCreateBranch: boolean }) {
  const [state, formAction, pending] = useActionState(createUnit, initial);

  return (
    <form action={formAction} className="space-y-4 max-w-lg">
      {state.error && (
        <p className="rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-800">{state.error}</p>
      )}

      <label className="block">
        <span className="text-sm font-medium">Name *</span>
        <input
          name="name"
          required
          maxLength={80}
          placeholder='e.g. Women2019s Fellowship'
          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-base"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Type</span>
        <select name="kind" className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-base"
          defaultValue={canCreateBranch ? 'group' : 'group'}>
          <option value="group">Group / division / committee</option>
          {canCreateBranch && <option value="branch">Family branch (admin only)</option>}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Description (optional)</span>
        <textarea
          name="description"
          rows={3}
          maxLength={300}
          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-base"
        />
      </label>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow active:bg-teal-800 disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create'}
        </button>
        <Link href="/units" className="rounded-full px-4 py-2.5 text-sm font-medium text-stone-600 underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
