import { getDirectory } from '@/lib/session';
import { DirectorySearch } from './directory-search';
import type { ProfileWithBranch } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/types';

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const all = await getDirectory();
  const query = (q ?? '').trim().toLowerCase();
  const people: ProfileWithBranch[] = query
    ? all.filter(
        (p) =>
          p.full_name.toLowerCase().includes(query) ||
          (p.branches?.name ?? '').toLowerCase().includes(query),
      )
    : all;

  // Group by branch for the multi-branch structure
  const groups = new Map<string, ProfileWithBranch[]>();
  for (const p of people) {
    const key = p.branches?.name ?? 'Unassigned branch';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold">Family directory</h1>
      <DirectorySearch initialQuery={q ?? ''} />

      {people.length === 0 && (
        <p className="text-sm text-stone-500 rounded-xl bg-white ring-1 ring-stone-200 p-4">
          No relatives found yet. Invited family members appear here after they
          sign in for the first time.
        </p>
      )}

      {[...groups.entries()].map(([branch, members]) => (
        <section key={branch}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
            {branch} · {members.length}
          </h2>
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="rounded-xl bg-white ring-1 ring-stone-200 p-3 flex items-center gap-3"
              >
                <div className="h-10 w-10 shrink-0 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  {m.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{m.full_name}</div>
                  <div className="text-xs text-stone-500">
                    {ROLE_LABELS[m.role]}
                    {m.phone ? ` · ${m.phone}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
