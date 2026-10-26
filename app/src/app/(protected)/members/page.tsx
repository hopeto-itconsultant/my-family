import Link from 'next/link';
import { requireProfile, getDirectory } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/types';

export default async function MembersPage() {
  const profile = await requireProfile();
  const people = await getDirectory();
  const isAdmin = profile.role === 'admin';

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Members &amp; accounts</h1>
        {isAdmin && (
          <Link
            href="/members/new"
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow active:bg-teal-800"
          >
            + Add member
          </Link>
        )}
      </div>

      {!isAdmin && (
        <p className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900">
          Only an admin can create or edit accounts. You can view the list here.
        </p>
      )}

      <ul className="space-y-2">
        {people.map((m) => (
          <li key={m.id} className="rounded-xl bg-white ring-1 ring-stone-200 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">
                {m.full_name}
                {m.date_of_death ? ' ✝' : ''}
              </p>
              {(m.nicknames?.length ?? 0) > 0 && (
                <p className="text-xs text-stone-400 truncate italic">“{m.nicknames!.join(', ')}”</p>
              )}
              <p className="text-xs text-stone-500 truncate">
                {m.phone ?? 'no mobile'} · {m.branches?.name ?? 'Unassigned'} · {ROLE_LABELS[m.role]}
              </p>
            </div>
            {isAdmin && (
              <Link
                href={`/members/${m.id}`}
                className="shrink-0 text-sm font-medium text-teal-700 underline underline-offset-2"
              >
                Edit
              </Link>
            )}
          </li>
        ))}
      </ul>

      <p className="text-xs text-stone-500">
        New members sign in with their mobile number and the temporary password
        you set. Ask them to change it from “Me” after first login.
      </p>
    </div>
  );
}
