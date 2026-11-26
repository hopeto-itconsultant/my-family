import Link from 'next/link';
import { buildTree } from '@/lib/tree';
import type { FamilyRelation } from '@/lib/types';
import type { TreePerson } from '@/lib/tree-layout';

/** The original generation list, kept beside the canvas. */
export function TreeList({
  people,
  relations,
}: {
  people: TreePerson[];
  relations: FamilyRelation[];
}) {
  const names = new Map(people.map((p) => [p.id, p.name]));
  const byId = new Map(people.map((p) => [p.id, p]));
  const tree = buildTree(relations, names);
  const linked = new Set<string>();
  for (const r of relations) {
    if (r.from_member === r.to_member) continue;
    linked.add(r.from_member);
    linked.add(r.to_member);
  }
  const unlinked = people
    .filter((p) => !linked.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const linkedCount = people.length - unlinked.length;

  if (linkedCount === 0) {
    return (
      <div className="space-y-5 pb-4">
        <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-6 text-center space-y-3">
          <div className="text-3xl" aria-hidden>🌳</div>
          <p className="text-sm text-stone-600">
            Treasurers and admins link relatives as parent, spouse, or sibling.
            The tree then shows here for everyone.
          </p>
          <Link href="/directory" className="inline-block text-sm font-medium text-teal-700 underline">
            Browse the directory
          </Link>
        </div>
        <Unlinked people={unlinked} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <ol className="space-y-6">
        {tree.generations.map((ids, gen) => (
          <li key={gen}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
              Generation {gen + 1}
            </h2>
            <ul className="space-y-2">
              {ids.map((id) => {
                const p = byId.get(id);
                const n = tree.nodes.get(id);
                if (!p || !n) return null;
                const rel = [
                  n.parentIds.length ? `${n.parentIds.length} parent${n.parentIds.length > 1 ? 's' : ''}` : '',
                  n.spouseIds.length ? 'married' : '',
                  n.siblingIds.length ? `${n.siblingIds.length} sibling${n.siblingIds.length > 1 ? 's' : ''}` : '',
                ].filter(Boolean).join(' · ');
                return (
                  <li key={id} className="rounded-xl bg-white ring-1 ring-stone-200 p-3 flex items-center gap-3">
                    <Initial name={p.name} />
                    <div className="min-w-0">
                      <Link href={directoryHref(p.name)} className="font-semibold truncate block">
                        {p.name}
                        {p.deceased ? ' ✝' : ''}
                      </Link>
                      <div className="text-xs text-stone-500">
                        {p.branch ?? 'Unassigned'}
                        {rel ? ` · ${rel}` : ''}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      <Unlinked people={unlinked} />
    </div>
  );
}

function Unlinked({ people }: { people: TreePerson[] }) {
  if (people.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
        Not yet linked · {people.length}
      </h2>
      <p className="text-xs text-stone-500 mb-3">
        These relatives are in the directory but have no tree links yet.
      </p>
      <ul className="flex flex-wrap gap-2">
        {people.map((p) => (
          <li key={p.id}>
            <Link
              href={directoryHref(p.name)}
              className="inline-block text-xs rounded-full bg-stone-100 ring-1 ring-stone-200 px-3 py-1.5"
            >
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Initial({ name }: { name: string }) {
  return (
    <div className="h-10 w-10 shrink-0 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function directoryHref(name: string): string {
  return `/directory?q=${encodeURIComponent(name)}`;
}
