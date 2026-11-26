'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { isMemberId } from '@/lib/tree-access';
import type { FamilyRelation, RelationKind } from '@/lib/types';
import type { TreePerson } from '@/lib/tree-layout';
import { directoryHref } from './tree-list';

export function relationLabel(
  personId: string,
  relation: FamilyRelation,
  nameOf: (id: string) => string,
): { label: string; otherId: string } | null {
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (relation.kind === 'parent' && eq(relation.from_member, personId)) {
    return { label: `Child of ${nameOf(relation.to_member)}`, otherId: relation.to_member };
  }
  if (relation.kind === 'parent' && eq(relation.to_member, personId)) {
    return { label: `Parent of ${nameOf(relation.from_member)}`, otherId: relation.from_member };
  }
  if (relation.kind === 'spouse' || relation.kind === 'sibling') {
    const other = eq(relation.from_member, personId)
      ? relation.to_member
      : eq(relation.to_member, personId)
        ? relation.from_member
        : null;
    if (!other) return null;
    const word = relation.kind === 'spouse' ? 'Spouse' : 'Sibling';
    return { label: `${word} of ${nameOf(other)}`, otherId: other };
  }
  return null;
}

export function edgeMatches(
  relation: FamilyRelation,
  a: string,
  b: string,
  kind: RelationKind,
  childIsA = false,
): boolean {
  const eq = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();
  if (relation.kind !== kind) return false;
  if (kind === 'parent') {
    const from = childIsA ? a : b;
    const to = childIsA ? b : a;
    return eq(relation.from_member, from) && eq(relation.to_member, to);
  }
  return (
    (eq(relation.from_member, a) && eq(relation.to_member, b)) ||
    (eq(relation.from_member, b) && eq(relation.to_member, a))
  );
}

export function RelationSheet({
  source,
  target,
  relations,
  pending,
  error,
  onClose,
  onBackdrop,
  onChoose,
  onRemove,
}: {
  source: TreePerson;
  target: TreePerson;
  relations: FamilyRelation[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onBackdrop?: () => void;
  onChoose: (kind: RelationKind, childIsA?: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const between = relations.filter(
    (r) => relationLabel(source.id, r, () => target.name) && involves(r, target.id),
  );
  const options: { kind: RelationKind; childIsA?: boolean; label: string }[] = [
    { kind: 'parent', childIsA: false, label: `Parent of ${firstName(target.name)}` },
    { kind: 'parent', childIsA: true, label: `Child of ${firstName(target.name)}` },
    { kind: 'spouse', label: 'Spouse' },
    { kind: 'sibling', label: 'Sibling' },
  ];

  return (
    <Sheet title={`Link ${source.name}`} onClose={onClose} onBackdrop={onBackdrop} closeRef={closeRef}>
      <p className="text-sm text-stone-500 -mt-2">with {target.name}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const current = between.some((r) =>
            edgeMatches(r, source.id, target.id, option.kind, option.childIsA),
          );
          return (
            <button
              key={option.label}
              type="button"
              disabled={pending}
              onClick={() => onChoose(option.kind, option.childIsA)}
              className={
                'rounded-xl px-3 py-3 text-sm font-semibold ring-1 transition active:scale-[0.99] disabled:opacity-40 ' +
                (current
                  ? 'bg-teal-700 text-white ring-teal-700'
                  : 'bg-stone-50 text-stone-800 ring-stone-300')
              }
            >
              {option.label}
              {current ? <span className="block text-[10px] font-medium opacity-80">Current link</span> : null}
            </button>
          );
        })}
      </div>
      {between.length > 0 && (
        <ul className="space-y-2">
          {between.map((r) => {
            const described = relationLabel(source.id, r, () => target.name);
            return (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-stone-600">{described?.label ?? r.kind}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRemove(r.id)}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm rounded-xl bg-red-50 text-red-800 ring-1 ring-red-200 p-3">{error}</p>}
    </Sheet>
  );
}

export function PersonSheet({
  person,
  relations,
  nameOf,
  canEdit,
  pending,
  error,
  onClose,
  onBackdrop,
  onRemove,
  onEditLink,
}: {
  person: TreePerson;
  relations: FamilyRelation[];
  nameOf: (id: string) => string;
  canEdit: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onBackdrop?: () => void;
  onRemove: (id: string) => void;
  onEditLink: (otherId: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  const links = relations
    .map((r) => ({ r, described: relationLabel(person.id, r, nameOf) }))
    .filter((row): row is { r: FamilyRelation; described: { label: string; otherId: string } } =>
      row.described !== null,
    );

  return (
    <Sheet title={person.name + (person.deceased ? ' ✝' : '')} onClose={onClose} onBackdrop={onBackdrop} closeRef={closeRef}>
      <div className="flex items-center gap-3 -mt-1">
        <div className="h-12 w-12 rounded-full bg-teal-100 text-teal-800 grid place-items-center font-bold">
          {person.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 text-sm text-stone-500">
          <div>{person.branch ? `Branch · ${person.branch}` : 'No branch yet'}</div>
          {person.nicknames.length > 0 && (
            <div className="truncate italic">“{person.nicknames.join(', ')}”</div>
          )}
        </div>
      </div>
      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map(({ r, described }) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 ring-1 ring-stone-200 px-3 py-2">
              <span className="text-sm min-w-0 truncate">{described.label}</span>
              {canEdit && (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onEditLink(described.otherId)}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200 disabled:opacity-40"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRemove(r.id)}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-500">No family links yet.</p>
      )}
      {error && <p className="text-sm rounded-xl bg-red-50 text-red-800 ring-1 ring-red-200 p-3">{error}</p>}
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={directoryHref(person.name)} className="font-medium text-teal-700 underline">
          View in directory
        </Link>
        {canEdit && isMemberId(person.id) && (
          <Link href={`/members/${person.id}`} className="font-medium text-teal-700 underline">
            Edit member
          </Link>
        )}
      </div>
    </Sheet>
  );
}

function Sheet({
  title,
  onClose,
  onBackdrop = onClose,
  closeRef,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Backdrop taps. Defaults to close. Callers can ignore the click that follows a touch tap. */
  onBackdrop?: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdrop();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5 space-y-4 shadow-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold leading-snug">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-full bg-stone-100 text-stone-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function involves(relation: FamilyRelation, id: string): boolean {
  const key = id.toLowerCase();
  return relation.from_member.toLowerCase() === key || relation.to_member.toLowerCase() === key;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
