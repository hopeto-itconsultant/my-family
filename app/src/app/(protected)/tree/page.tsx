import Link from 'next/link';
import { requireProfile, getDirectory, getRelations, canManage } from '@/lib/session';
import { buildTree } from '@/lib/tree';
import type { ProfileWithBranch } from '@/lib/types';
import { AddRelationSheet } from './add-relation';

export const metadata = { title: 'Family tree · Our Family Home' };

export default async function TreePage() {
  const profile = await requireProfile();
  const [people, relations] = await Promise.all([getDirectory(), getRelations()]);

  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const byId = new Map<string, ProfileWithBranch>(people.map((p) => [p.id, p]));
  const tree = buildTree(relations, names);

  const connectedCount = tree.nodes.size - tree.unconnected.length;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Family tree</h1>
          <p className="text-sm text-stone-500 mt-1">
            {connectedCount === 0
              ? 'No relations recorded yet.'
              : `${tree.generations.length} generation${tree.generations.length > 1 ? 's' : ''} · ${connectedCount} linked`}
          </p>
        </div>
        {canManage(profile) && <AddRelationSheet people={people.map((p) => ({ id: p.id, name: p.full_name }))} />}
      </div>

      {tree.hasCycle && (
        <p className="text-xs rounded-xl bg-amber-50 text-amber-900 ring-1 ring-amber-200 p-3">
          ⚠️ Some parent relationships form a loop — the treasurer should review
          the edges. The view below is best-effort until fixed.
        </p>
      )}

      {connectedCount === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-6 text-center space-y-3">
          <div className="text-3xl" aria-hidden>🌳</div>
          <p className="text-sm text-stone-600">
            Coordinators link relatives as parent / spouse / sibling, and the
            tree appears here for everyone.
          </p>
          <Link href="/directory" className="inline-block text-sm font-medium text-teal-700 underline">
            Browse the directory →
          </Link>
        </div>
      ) : (
        <ol className="space-y-6">
          {tree.generations.map((ids, gen) => (
            <li key={gen}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                Generation {gen + 1}
              </h2>
              <ul className="space-y-2">
                {ids.map((id) => {
                  const p = byId.get(id);
                  const n = tree.nodes.get(id)!;
                  if (!p) return null; // profile not visible via RLS -> skip gracefully
                  const rel = [
                    n.parentIds.length ? `${n.parentIds.length} parent${n.parentIds.length > 1 ? 's' : ''}` : '',
                    n.spouseIds.length ? 'married' : '',
                    n.siblingIds.length ? `${n.siblingIds.length} sib${n.siblingIds.length > 1 ? 's' : ''}` : '',
                  ].filter(Boolean).join(' · ');
                  return (
                    <li key={id} className="rounded-xl bg-white ring-1 ring-stone-200 p-3 flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                        {p.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/directory?q=${encodeURIComponent(p.full_name)}`} className="font-semibold truncate block">
                          {p.full_name}
                        </Link>
                        <div className="text-xs text-stone-500">
                          {p.branches?.name ?? 'Unassigned'}{rel ? ` · ${rel}` : ''}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {tree.unconnected.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
            Not yet linked · {tree.unconnected.length}
          </h2>
          <p className="text-xs text-stone-500 mb-3">
            These relatives are in the directory but have no tree edges yet.
          </p>
          <ul className="flex flex-wrap gap-2">
            {tree.unconnected.map((id) => {
              const p = byId.get(id);
              return p ? (
                <li key={id} className="text-xs rounded-full bg-stone-100 ring-1 ring-stone-200 px-3 py-1.5">
                  {p.full_name}
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
