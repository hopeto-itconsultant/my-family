import Link from 'next/link';
import { requireProfile, getDirectory } from '@/lib/session';
import { getActivePreview, memberIdsWithLogin } from '@/lib/view-as-session';
import { ViewAsButton } from '@/components/view-as-button';
import { ROLE_LABELS } from '@/lib/types';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const profile = await requireProfile();
  const preview = await getActivePreview();
  const people = await getDirectory();
  const sp = await searchParams;
  const isAdmin = profile.role === 'admin' && !preview;
  const loginIds = isAdmin ? await memberIdsWithLogin() : null;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Members &amp; accounts</h1>
        {isAdmin && (
          <Link
            href="/members/new"
            className="inline-flex min-h-11 items-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white shadow active:bg-teal-800"
          >
            + Add member
          </Link>
        )}
      </div>

      {sp.error && (
        <p role="alert" className="rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-800">
          {sp.error}
        </p>
      )}

      {!isAdmin && !preview && (
        <p className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900">
          Only an admin can create or edit accounts. You can view the list here.
        </p>
      )}

      {isAdmin && (
        <p className="text-sm text-stone-500">
          View as opens a read-only preview of that relative&apos;s screens. It does not change their password.
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
              <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                <Link
                  href={`/members/${m.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-teal-800 ring-1 ring-teal-200"
                >
                  Edit
                </Link>
                <ViewAsButton
                  memberId={m.id}
                  hasLogin={loginIds ? loginIds.has(m.id) : null}
                  back="/members"
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && (
        <p className="text-xs text-stone-500">
          Assign a treasurer from Edit: set Role to Treasurer. Set it back to Member to unassign.
          Only treasurers and admins can change the Mission Fund. Everyone else can view it.
        </p>
      )}

      <p className="text-xs text-stone-500">
        New members sign in with their mobile number and the temporary password
        you set. Ask them to change it from “Me” after first login.
      </p>
    </div>
  );
}
