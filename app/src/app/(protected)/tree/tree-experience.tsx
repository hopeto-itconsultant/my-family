'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { AddRelationSheet } from './add-relation';
import { TreeList } from './tree-list';
import { buildTree } from '@/lib/tree';
import type { FamilyRelation } from '@/lib/types';
import type { TreePerson } from '@/lib/tree-layout';

const FamilyTreeCanvas = dynamic(
  () => import('./family-tree-canvas').then((m) => m.FamilyTreeCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="mx-2 h-full min-h-[280px] rounded-2xl bg-white ring-1 ring-stone-200 animate-pulse"
        role="status"
        aria-label="Loading family tree"
      />
    ),
  },
);

export function TreeExperience({
  people,
  relations,
  canEdit,
  localOnly = false,
}: {
  people: TreePerson[];
  relations: FamilyRelation[];
  canEdit: boolean;
  localOnly?: boolean;
}) {
  const [mode, setMode] = useState<'tree' | 'list'>('tree');
  const summary = useMemo(() => {
    const names = new Map(people.map((p) => [p.id, p.name]));
    const linked = new Set<string>();
    for (const r of relations) {
      if (r.from_member && r.to_member && r.from_member !== r.to_member) {
        linked.add(r.from_member);
        linked.add(r.to_member);
      }
    }
    const linkedCount = people.filter((p) => linked.has(p.id)).length;
    const model = buildTree(relations, names);
    return { linkedCount, generations: model.generations.length, hasCycle: model.hasCycle };
  }, [people, relations]);

  const subtitle =
    summary.linkedCount === 0
      ? 'No relations recorded yet.'
      : `${summary.generations} generation${summary.generations === 1 ? '' : 's'} · ${summary.linkedCount} linked`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Family tree</h1>
          <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>
        </div>
        {canEdit && !localOnly && (
          <AddRelationSheet people={people.map((p) => ({ id: p.id, name: p.name }))} />
        )}
      </div>

      <div className="px-4 pb-3 shrink-0">
        <div
          role="tablist"
          aria-label="Family tree layout"
          className="grid grid-cols-2 gap-1 rounded-xl bg-stone-200/80 p-1 text-sm font-medium max-w-[220px]"
        >
          <Tab selected={mode === 'tree'} onClick={() => setMode('tree')}>
            Tree
          </Tab>
          <Tab selected={mode === 'list'} onClick={() => setMode('list')}>
            List
          </Tab>
        </div>
      </div>

      {summary.hasCycle && (
        <p className="mx-4 mb-3 shrink-0 text-xs rounded-xl bg-amber-50 text-amber-900 ring-1 ring-amber-200 p-3">
          Some parent links form a loop. A treasurer or admin should review them.
          The picture below is approximate until that is fixed.
        </p>
      )}

      <div className="flex-1 min-h-0">
        {mode === 'tree' ? (
          <FamilyTreeCanvas
            people={people}
            relations={relations}
            canEdit={canEdit}
            localOnly={localOnly}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="px-4 max-w-lg mx-auto">
              <TreeList people={people} relations={relations} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={
        'rounded-lg py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
        (selected ? 'bg-white shadow text-teal-800' : 'text-stone-600')
      }
    >
      {children}
    </button>
  );
}
