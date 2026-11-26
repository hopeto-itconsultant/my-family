'use client';

// HTML/SVG canvas rather than React Flow or elkjs. Spouse rows and sibling
// groups are a family layout, not a general graph, and this file is loaded
// only when the tree page opens.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { addRelation, changeRelation, deleteRelation } from '@/app/actions/tree';
import { canonicalizeRelation } from '@/lib/tree-access';
import {
  CARD_W,
  SPOUSE_GAP,
  layoutFamilyTree,
  type FamilyLayout,
  type LayoutLink,
  type LayoutNode,
  type TreePerson,
} from '@/lib/tree-layout';
import type { FamilyRelation, RelationKind } from '@/lib/types';
import { PersonSheet, RelationSheet, edgeMatches } from './tree-sheets';

const MIN_SCALE = 0.28;
const MAX_SCALE = 2.4;

interface View {
  x: number;
  y: number;
  scale: number;
}

type Gesture =
  | { kind: 'none' }
  | {
      kind: 'press';
      id: number;
      personId: string | null;
      relation: { a: string; b: string } | null;
      sx: number;
      sy: number;
      pointerType: string;
      tray: boolean;
    }
  | { kind: 'pan'; id: number; lx: number; ly: number }
  | { kind: 'pinch' }
  | { kind: 'drag'; id: number; personId: string }
  | { kind: 'ignore' };

export function FamilyTreeCanvas({
  people,
  relations: incoming,
  canEdit,
  localOnly = false,
}: {
  people: TreePerson[];
  relations: FamilyRelation[];
  canEdit: boolean;
  /** Dev preview only: apply links in memory when there is no signed-in session. */
  localOnly?: boolean;
}) {
  const router = useRouter();
  const [relations, setRelations] = useState(incoming);
  const [serverKey, setServerKey] = useState(() => relationsKey(incoming));
  const nextKey = relationsKey(incoming);
  if (!localOnly && nextKey !== serverKey) {
    setServerKey(nextKey);
    setRelations(incoming);
  }

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const nameOf = useCallback(
    (id: string) => peopleById.get(id)?.name ?? 'Family member',
    [peopleById],
  );
  const layout = useMemo(
    () => layoutFamilyTree(people.map((p) => ({ id: p.id, name: p.name })), relations),
    [people, relations],
  );
  const unlinked = useMemo(
    () =>
      layout.unlinked
        .map((id) => peopleById.get(id))
        .filter((p): p is TreePerson => Boolean(p)),
    [layout.unlinked, peopleById],
  );

  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 });
  const viewRef = useRef(view);
  const commitView = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);
  const [animating, setAnimating] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(
    () => unlinked.length > 0 && (layout.nodes.length === 0 || unlinked.length <= 12),
  );
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ a: string; b: string } | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const userAdjusted = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ kind: 'none' });
  const pressTimer = useRef<number | null>(null);
  const pinch = useRef<{ dist: number } | null>(null);
  const suppressClick = useRef(false);
  const openTimer = useRef<number | null>(null);
  const openedAt = useRef(0);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const root = shellRef.current;
    if (!root || !canEdit) return;
    // A scrollable tray will cancel the pointer as soon as the finger moves
    // unless the touch is claimed. Claiming it keeps long-press drags alive.
    const claim = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-person-id]')) return;
      const g = gesture.current;
      if (g.kind === 'drag' || g.kind === 'press' || g.kind === 'pinch') e.preventDefault();
    };
    root.addEventListener('touchmove', claim, { passive: false });
    return () => root.removeEventListener('touchmove', claim);
  }, [canEdit]);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, nextScale: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const current = viewRef.current;
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      commitView({ scale, x: px - worldX * scale, y: py - worldY * scale });
    },
    [commitView],
  );

  const frameTree = useCallback((mode: 'readable' | 'all') => {
    const el = viewportRef.current;
    if (!el || layout.width <= 0 || layout.height <= 0) return;
    const pad = 16;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw < 40 || vh < 40) return;
    const fitAll = Math.min((vw - pad * 2) / layout.width, (vh - pad * 2) / layout.height);
    let scale: number;
    if (mode === 'all' || fitAll >= 0.9) {
      scale = clamp(fitAll, MIN_SCALE, 1.05);
    } else {
      // Keep a couple readable and let people pan to the rest.
      const focus = Math.min(layout.width, CARD_W * 2 + SPOUSE_GAP + 36);
      scale = clamp((vw - pad * 2) / focus, 0.8, 1);
    }
    const scaledW = layout.width * scale;
    const scaledH = layout.height * scale;
    const x = (vw - scaledW) / 2;
    const y = scaledH <= vh - pad * 2 ? (vh - scaledH) / 2 : pad;
    if (!reduceMotion.current) {
      setAnimating(true);
      window.setTimeout(() => setAnimating(false), 280);
    }
    commitView({ x, y, scale });
  }, [commitView, layout.height, layout.width]);

  useLayoutEffect(() => {
    userAdjusted.current = false;
    frameTree('readable');
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!userAdjusted.current) frameTree('readable');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [frameTree]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userAdjusted.current = true;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      zoomAt(e.clientX, e.clientY, viewRef.current.scale * factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, layout.nodes.length]);

  useEffect(() => {
    if (!highlight) return;
    const t = window.setTimeout(() => setHighlight((id) => (id === highlight ? null : id)), 2800);
    return () => window.clearTimeout(t);
  }, [highlight]);

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function scheduleOpen(action: { type: 'profile'; id: string } | { type: 'link'; a: string; b: string }) {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    // Open after the synthetic click. Opening during pointerup lets that click
    // land on the new sheet's backdrop and dismiss it, which breaks touch taps.
    suppressClick.current = true;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      suppressClick.current = false;
      openedAt.current = Date.now();
      setError(null);
      if (action.type === 'profile') {
        setDialog(null);
        setProfileId(action.id);
      } else {
        setProfileId(null);
        setDialog({ a: action.a, b: action.b });
      }
    }, 30);
  }

  function beginDrag(personId: string, x: number, y: number, pointerId: number) {
    gesture.current = { kind: 'drag', id: pointerId, personId };
    setDragging({ id: personId, x, y });
    setDropId(null);
    shellRef.current?.setPointerCapture(pointerId);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-tree-control]')) return;
    const personEl = target.closest('[data-person-id]');
    const personId = personEl?.getAttribute('data-person-id') ?? null;
    const tray = Boolean(personEl?.closest('[data-tree-tray]'));
    const relationEl = target.closest('[data-relation-a]');
    const relation =
      relationEl instanceof HTMLElement
        ? {
            a: relationEl.dataset.relationA ?? '',
            b: relationEl.dataset.relationB ?? '',
          }
        : null;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      clearPress();
      gesture.current = { kind: 'pinch' };
      pinch.current = null;
      setDragging(null);
      setDropId(null);
      return;
    }
    gesture.current = {
      kind: 'press',
      id: e.pointerId,
      personId,
      relation: relation && relation.a && relation.b ? relation : null,
      sx: e.clientX,
      sy: e.clientY,
      pointerType: e.pointerType,
      tray,
    };
    if (canEdit && personId && e.pointerType !== 'mouse') {
      pressTimer.current = window.setTimeout(() => {
        const g = gesture.current;
        if (g.kind !== 'press' || g.personId !== personId) return;
        const point = pointers.current.get(g.id);
        beginDrag(personId, point?.x ?? g.sx, point?.y ?? g.sy, g.id);
      }, 420);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === 'pinch' || pointers.current.size >= 2) {
      applyPinch();
      return;
    }
    if (g.kind === 'drag') {
      setDragging({ id: g.personId, x: e.clientX, y: e.clientY });
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const id = under?.closest('[data-person-id]')?.getAttribute('data-person-id') ?? null;
      setDropId(id && id !== g.personId ? id : null);
      return;
    }
    if (g.kind === 'pan') {
      const dx = e.clientX - g.lx;
      const dy = e.clientY - g.ly;
      g.lx = e.clientX;
      g.ly = e.clientY;
      userAdjusted.current = true;
      commitView({ ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy });
      return;
    }
    if (g.kind !== 'press') return;
    const dist = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
    if (dist < 8) return;
    clearPress();
    if (canEdit && g.personId && g.pointerType === 'mouse') {
      beginDrag(g.personId, e.clientX, e.clientY, e.pointerId);
      return;
    }
    if (g.tray || !viewportRef.current) {
      gesture.current = { kind: 'ignore' };
      return;
    }
    gesture.current = { kind: 'pan', id: e.pointerId, lx: e.clientX, ly: e.clientY };
    shellRef.current?.setPointerCapture(e.pointerId);
  }

  function applyPinch() {
    const pts = [...pointers.current.values()];
    if (pts.length < 2 || !viewportRef.current) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const prev = pinch.current;
    pinch.current = { dist };
    if (!prev || prev.dist <= 0) return;
    userAdjusted.current = true;
    zoomAt(midX, midY, viewRef.current.scale * (dist / prev.dist));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'press' && g.id === e.pointerId) clearPress();
    if (pointers.current.size < 2) pinch.current = null;
    if (g.kind === 'drag' && g.id === e.pointerId) {
      suppressClick.current = true;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const id = under?.closest('[data-person-id]')?.getAttribute('data-person-id') ?? null;
      if (!cancelled && id && id !== g.personId) {
        scheduleOpen({ type: 'link', a: g.personId, b: id });
      }
      setDragging(null);
      setDropId(null);
      gesture.current = { kind: 'none' };
      return;
    }
    if (g.kind === 'press' && g.id === e.pointerId) {
      const dist = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
      if (!cancelled && dist < 8) {
        if (g.personId) scheduleOpen({ type: 'profile', id: g.personId });
        else if (canEdit && g.relation) scheduleOpen({ type: 'link', a: g.relation.a, b: g.relation.b });
      }
      gesture.current = { kind: 'none' };
      return;
    }
    if (g.kind === 'pinch' && pointers.current.size < 2) gesture.current = { kind: 'none' };
    if ((g.kind === 'pan' || g.kind === 'ignore') && g.kind !== 'pan') gesture.current = { kind: 'none' };
    if (g.kind === 'pan' && g.id === e.pointerId) gesture.current = { kind: 'none' };
  }

  function jumpTo(id: string) {
    setQuery('');
    setHighlight(id);
    const node = layout.nodes.find((n) => n.id === id);
    const el = viewportRef.current;
    if (!node || !el) {
      setTrayOpen(true);
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-tree-tray] [data-person-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      });
      return;
    }
    const scale = clamp(Math.max(viewRef.current.scale, 1), MIN_SCALE, MAX_SCALE);
    userAdjusted.current = true;
    if (!reduceMotion.current) {
      setAnimating(true);
      window.setTimeout(() => setAnimating(false), 280);
    }
    commitView({
      scale,
      x: el.clientWidth / 2 - (node.x + node.w / 2) * scale,
      y: el.clientHeight / 2 - (node.y + node.h / 2) * scale,
    });
  }

  async function choose(kind: RelationKind, childIsA = false) {
    if (!dialog) return;
    setPending(true);
    setError(null);
    const { a, b } = dialog;
    try {
      if (localOnly) {
        applyLocal(a, b, kind, childIsA);
        setDialog(null);
        return;
      }
      const edge = canonicalizeRelation({ a, b, kind, childIsA });
      if (!edge.ok) {
        setError(edge.error);
        return;
      }
      const between = relations.filter((r) => pairOf(r, a, b));
      const exact = between.find((r) => edgeMatches(r, a, b, kind, childIsA));
      if (exact) {
        setDialog(null);
        return;
      }
      const snapshot = relations;
      if (between.length === 1) {
        const previous = between[0];
        setRelations((prev) =>
          prev.map((r) =>
            r.id === previous.id
              ? { ...r, from_member: edge.from, to_member: edge.to, kind: edge.kind }
              : r,
          ),
        );
        const res = await changeRelation({ id: previous.id, a, b, kind, childIsA });
        if (!res.ok) {
          setRelations(snapshot);
          setError(res.error ?? 'Could not change the relation.');
          return;
        }
        if (res.id) {
          setRelations((prev) => prev.map((r) => (r.id === previous.id ? { ...r, id: res.id! } : r)));
        }
      } else {
        const tempId = crypto.randomUUID();
        setRelations((prev) => [
          ...prev,
          { id: tempId, from_member: edge.from, to_member: edge.to, kind: edge.kind },
        ]);
        const res = await addRelation({ a, b, kind, childIsA });
        if (!res.ok) {
          setRelations(snapshot);
          setError(res.error ?? 'Could not save the relation.');
          return;
        }
        if (res.id) {
          setRelations((prev) => prev.map((r) => (r.id === tempId ? { ...r, id: res.id! } : r)));
        }
      }
      setDialog(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    setError(null);
    const snapshot = relations;
    setRelations((prev) => prev.filter((r) => r.id !== id));
    try {
      if (localOnly) return;
      const res = await deleteRelation(id);
      if (!res.ok) {
        setRelations(snapshot);
        setError(res.error ?? 'Could not remove the relation.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function applyLocal(a: string, b: string, kind: RelationKind, childIsA: boolean) {
    let from = a;
    let to = b;
    if (kind === 'parent') {
      from = childIsA ? a : b;
      to = childIsA ? b : a;
    } else if (a > b) {
      from = b;
      to = a;
    }
    setRelations((prev) => {
      const between = prev.filter((r) => pairOf(r, a, b));
      const exact = between.find((r) => edgeMatches(r, a, b, kind, childIsA));
      if (exact) return prev;
      if (between.length === 1) {
        return prev.map((r) =>
          r.id === between[0].id ? { ...r, from_member: from, to_member: to, kind } : r,
        );
      }
      return [...prev, { id: `local-${from}-${to}-${kind}`, from_member: from, to_member: to, kind }];
    });
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? people
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.nicknames.some((n) => n.toLowerCase().includes(q)) ||
            (p.branch ?? '').toLowerCase().includes(q),
        )
        .slice(0, 8)
    : [];
  const dialogSource = dialog ? peopleById.get(dialog.a) : undefined;
  const dialogTarget = dialog ? peopleById.get(dialog.b) : undefined;
  const profile = profileId ? peopleById.get(profileId) : undefined;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 pb-2 flex items-start gap-2 shrink-0" data-tree-control>
        <div className="relative flex-1 min-w-0">
          <label className="sr-only" htmlFor="tree-search">
            Find a relative
          </label>
          <input
            id="tree-search"
            type="search"
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="tree-search-results"
            aria-autocomplete="list"
            placeholder="Find a relative"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                e.preventDefault();
                jumpTo(matches[0].id);
              }
              if (e.key === 'Escape') setQuery('');
            }}
            className="w-full rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-teal-700"
          />
          {matches.length > 0 && (
            <ul
              id="tree-search-results"
              role="listbox"
              className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-stone-200"
            >
              {matches.map((p) => (
                <li key={p.id} role="option" aria-selected={highlight === p.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(p.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-teal-50"
                  >
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 text-[11px] text-stone-400">
                      {layout.nodes.some((n) => n.id === p.id) ? (p.branch ?? 'Linked') : 'Unlinked'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 rounded-xl bg-white ring-1 ring-stone-300 overflow-hidden">
          <ZoomButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)} disabled={layout.nodes.length === 0}>
            −
          </ZoomButton>
          <ZoomButton label="Fit tree on screen" onClick={() => { userAdjusted.current = true; frameTree('all'); }} disabled={layout.nodes.length === 0}>
            Fit
          </ZoomButton>
          <ZoomButton label="Zoom in" onClick={() => zoomBy(1.2)} disabled={layout.nodes.length === 0}>
            +
          </ZoomButton>
        </div>
      </div>
      {canEdit && (
        <p className="px-3 pb-2 text-[11px] leading-snug text-stone-500 shrink-0">
          Hold a name and drop it on someone to choose Parent, Child, Spouse, or Sibling.
        </p>
      )}

      <div
        ref={shellRef}
        className="flex flex-col flex-1 min-h-0 select-none"
        style={{ WebkitTouchCallout: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerUp(e, false)}
        onPointerCancel={(e) => onPointerUp(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {layout.nodes.length === 0 ? (
          <div className="mx-2 mb-2 rounded-2xl bg-white ring-1 ring-stone-200 px-4 py-8 text-center space-y-2">
            <div className="text-3xl" aria-hidden>🌳</div>
            <p className="text-sm font-medium text-stone-800">No relations yet</p>
            <p className="text-sm text-stone-500">
              {canEdit
                ? 'Everyone linked will appear on the tree. Start by dropping one name onto another.'
                : 'When a treasurer or admin links relatives, the tree shows up here.'}
            </p>
          </div>
        ) : (
          <div
            ref={viewportRef}
            className="relative mx-2 flex-1 min-h-[240px] overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 touch-none"
            style={{
              backgroundImage: 'radial-gradient(#e7e5e4 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          >
            <div
              className="absolute top-0 left-0"
              style={{
                width: layout.width,
                height: layout.height,
                transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                transformOrigin: '0 0',
                transition: animating ? 'transform 280ms ease' : undefined,
              }}
            >
              <Connectors layout={layout} canEdit={canEdit} nameOf={nameOf} />
              {layout.components.length > 1 &&
                layout.components.map((c) => (
                  <div
                    key={c.index}
                    className="absolute text-[11px] font-semibold uppercase tracking-wide text-stone-400 max-w-[240px] truncate"
                    style={{ left: 12, top: c.top + 8 }}
                  >
                    {c.title}
                  </div>
                ))}
              {layout.nodes.map((node) => {
                const person = peopleById.get(node.id);
                const active = highlight === node.id || dropId === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    data-person-id={node.id}
                    aria-grabbed={dragging?.id === node.id}
                    aria-label={
                      canEdit
                        ? `${person?.name ?? 'Family member'}. Hold to drag, or tap for details.`
                        : `${person?.name ?? 'Family member'}. Tap for details.`
                    }
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      setError(null);
                      setProfileId(node.id);
                    }}
                    className={
                      'absolute text-left rounded-2xl bg-white shadow-sm ring-1 px-2 py-1.5 flex items-center gap-2 ' +
                      (canEdit ? 'touch-none ' : '') +
                      (dropId === node.id
                        ? 'ring-2 ring-teal-600'
                        : highlight === node.id
                          ? 'ring-2 ring-amber-400'
                          : 'ring-stone-200') +
                      (dragging?.id === node.id ? ' opacity-40' : '') +
                      (canEdit ? ' cursor-grab' : '')
                    }
                    style={{ left: node.x, top: node.y, width: node.w, height: node.h, zIndex: active ? 2 : 1 }}
                  >
                    <span className="h-8 w-8 shrink-0 rounded-full bg-teal-100 text-teal-800 grid place-items-center text-sm font-bold">
                      {(person?.name ?? '?').charAt(0).toUpperCase()}
                    </span>
                    <span className={'min-w-0 flex-1 ' + (canEdit ? 'pr-3' : '')}>
                      <span className="block text-[13px] font-semibold leading-tight truncate text-stone-900">
                        {person?.name ?? 'Family member'}
                        {person?.deceased ? ' ✝' : ''}
                      </span>
                      <span className="block text-[10px] text-stone-500 truncate">
                        {person?.branch ?? person?.nicknames[0] ?? 'Family'}
                      </span>
                    </span>
                    {canEdit && (
                      <span className="absolute right-1.5 top-1.5 text-[10px] leading-none text-stone-300" aria-hidden>
                        ⋮⋮
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {unlinked.length > 0 && (
          <section data-tree-tray className="mt-2 shrink-0 border-t border-stone-200 bg-stone-50/90">
            <button
              type="button"
              data-tree-control
              aria-expanded={trayOpen}
              onClick={() => setTrayOpen((open) => !open)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Unlinked · {unlinked.length}
              </span>
              <span className="text-xs text-stone-400">{trayOpen ? 'Hide' : 'Show'}</span>
            </button>
            {trayOpen && (
              <ul className={`flex flex-wrap gap-2 px-3 pb-3 ${layout.nodes.length === 0 ? 'max-h-[46vh] overflow-y-auto' : 'max-h-40 overflow-y-auto'}`}>
                {unlinked.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      data-person-id={p.id}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        setError(null);
                        setProfileId(p.id);
                      }}
                      className={
                        'rounded-full bg-white px-3 py-1.5 text-sm ring-1 ' +
                        (canEdit ? 'touch-none ' : '') +
                        (dropId === p.id
                          ? 'ring-2 ring-teal-600'
                          : highlight === p.id
                            ? 'ring-2 ring-amber-400'
                            : 'ring-stone-300') +
                        (canEdit ? ' cursor-grab' : '')
                      }
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {dragging && (
        <div
          className="fixed z-40 pointer-events-none rounded-full bg-teal-800 px-3 py-1.5 text-sm font-semibold text-white shadow-lg"
          style={{ left: dragging.x, top: dragging.y - 48, transform: 'translate(-50%, -50%)' }}
        >
          {nameOf(dragging.id)}
        </div>
      )}

      {dialog && dialogSource && dialogTarget && (
        <RelationSheet
          source={dialogSource}
          target={dialogTarget}
          relations={relations}
          pending={pending}
          error={error}
          onClose={() => {
            setDialog(null);
            setError(null);
          }}
          onBackdrop={() => {
            if (Date.now() - openedAt.current < 500) return;
            setDialog(null);
            setError(null);
          }}
          onChoose={choose}
          onRemove={remove}
        />
      )}
      {profile && !dialog && (
        <PersonSheet
          person={profile}
          relations={relations}
          nameOf={nameOf}
          canEdit={canEdit}
          pending={pending}
          error={error}
          onClose={() => {
            setProfileId(null);
            setError(null);
          }}
          onBackdrop={() => {
            if (Date.now() - openedAt.current < 500) return;
            setProfileId(null);
            setError(null);
          }}
          onRemove={remove}
          onEditLink={(otherId) => {
            setProfileId(null);
            setError(null);
            setDialog({ a: profile.id, b: otherId });
          }}
        />
      )}
    </div>
  );

  function zoomBy(factor: number) {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    userAdjusted.current = true;
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, viewRef.current.scale * factor);
  }
}

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="px-3 py-2 text-sm font-semibold text-stone-700 disabled:opacity-30 hover:bg-stone-50"
    >
      {children}
    </button>
  );
}

function Connectors({
  layout,
  canEdit,
  nameOf,
}: {
  layout: FamilyLayout;
  canEdit: boolean;
  nameOf: (id: string) => string;
}) {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const parentsByChild = new Map<string, string[]>();
  for (const link of layout.links) {
    if (link.kind !== 'parent') continue;
    if (!byId.has(link.fromId) || !byId.has(link.toId)) continue;
    const list = parentsByChild.get(link.toId) ?? [];
    list.push(link.fromId);
    parentsByChild.set(link.toId, list);
  }
  const groups = new Map<string, { parents: LayoutNode[]; children: LayoutNode[] }>();
  for (const [childId, parentIds] of parentsByChild) {
    const key = [...parentIds].sort().join('|');
    const group = groups.get(key) ?? {
      parents: parentIds.map((id) => byId.get(id)!).filter(Boolean),
      children: [],
    };
    const child = byId.get(childId);
    if (child) group.children.push(child);
    groups.set(key, group);
  }

  const spouses = layout.links.filter(
    (l) => l.kind === 'spouse' && byId.has(l.fromId) && byId.has(l.toId),
  );
  const siblings = layout.links.filter((l) => {
    if (l.kind !== 'sibling' || !byId.has(l.fromId) || !byId.has(l.toId)) return false;
    return !sharesParent(l.fromId, l.toId, layout.links);
  });

  return (
    <svg
      className="absolute inset-0 overflow-visible pointer-events-none"
      width={layout.width}
      height={layout.height}
      aria-hidden={!canEdit}
    >
      {[...groups.values()].map((group) => (
        <path
          key={group.parents.map((n) => n.id).join('-') + '>' + group.children.map((n) => n.id).join('-')}
          d={parentBus(group.parents, group.children)}
          fill="none"
          stroke="#a8a29e"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {siblings.map((link) => (
        <InteractivePath
          key={link.relationId}
          d={siblingPath(byId.get(link.fromId)!, byId.get(link.toId)!)}
          stroke="#a8a29e"
          dashed
          link={link}
          canEdit={canEdit}
          nameOf={nameOf}
        />
      ))}
      {spouses.map((link) => {
        const geometry = spouseGeometry(byId.get(link.fromId)!, byId.get(link.toId)!);
        return (
          <g key={link.relationId}>
            <InteractivePath d={geometry.d} stroke="#0f766e" link={link} canEdit={canEdit} nameOf={nameOf} />
            <circle cx={geometry.mx} cy={geometry.my} r={4} fill="#0f766e" style={{ pointerEvents: 'none' }} />
          </g>
        );
      })}
    </svg>
  );
}

function InteractivePath({
  d,
  stroke,
  dashed,
  link,
  canEdit,
  nameOf,
}: {
  d: string;
  stroke: string;
  dashed?: boolean;
  link: LayoutLink;
  canEdit: boolean;
  nameOf: (id: string) => string;
}) {
  return (
    <g>
      {canEdit && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          strokeLinecap="round"
          style={{ pointerEvents: 'stroke' }}
          data-relation-a={link.fromId}
          data-relation-b={link.toId}
          role="button"
          aria-label={`Change the link between ${nameOf(link.fromId)} and ${nameOf(link.toId)}`}
        >
          <title>Change link</title>
        </path>
      )}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dashed ? '4 4' : undefined}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
}

function parentBus(parents: LayoutNode[], children: LayoutNode[]): string {
  if (parents.length === 0 || children.length === 0) return '';
  const pBottom = Math.max(...parents.map((n) => n.y + n.h));
  const cTop = Math.min(...children.map((n) => n.y));
  const midY = pBottom + Math.max(12, (cTop - pBottom) / 2);
  const pxs = parents.map((n) => n.x + n.w / 2);
  const cxs = children.map((n) => n.x + n.w / 2);
  const left = Math.min(...pxs, ...cxs);
  const right = Math.max(...pxs, ...cxs);
  const parts = pxs.map((x) => `M ${x} ${pBottom} V ${midY}`);
  parts.push(`M ${left} ${midY} H ${right}`);
  parts.push(...cxs.map((x) => `M ${x} ${midY} V ${cTop}`));
  return parts.join(' ');
}

function spouseGeometry(a: LayoutNode, b: LayoutNode): { d: string; mx: number; my: number } {
  const left = a.x <= b.x ? a : b;
  const right = a.x <= b.x ? b : a;
  const y1 = left.y + left.h / 2;
  const y2 = right.y + right.h / 2;
  const x1 = left.x + left.w;
  const x2 = right.x;
  if (Math.abs(y1 - y2) < 2 && x2 >= x1 - 1) {
    return { d: `M ${x1} ${y1} H ${x2}`, mx: (x1 + x2) / 2, my: y1 };
  }
  const c = (x1 + x2) / 2;
  return { d: `M ${x1} ${y1} C ${c} ${y1}, ${c} ${y2}, ${x2} ${y2}`, mx: c, my: (y1 + y2) / 2 };
}

function siblingPath(a: LayoutNode, b: LayoutNode): string {
  const left = a.x <= b.x ? a : b;
  const right = a.x <= b.x ? b : a;
  const x1 = left.x + left.w / 2;
  const x2 = right.x + right.w / 2;
  const y = Math.min(left.y, right.y) - 10;
  return `M ${x1} ${left.y} Q ${(x1 + x2) / 2} ${y}, ${x2} ${right.y}`;
}

function sharesParent(a: string, b: string, links: LayoutLink[]): boolean {
  const parents = new Set(links.filter((l) => l.kind === 'parent' && l.toId === a).map((l) => l.fromId));
  return links.some((l) => l.kind === 'parent' && l.toId === b && parents.has(l.fromId));
}

function pairOf(relation: FamilyRelation, a: string, b: string): boolean {
  const eq = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();
  const fromA = eq(relation.from_member, a) || eq(relation.to_member, a);
  const fromB = eq(relation.from_member, b) || eq(relation.to_member, b);
  return fromA && fromB;
}

function relationsKey(relations: FamilyRelation[]): string {
  return relations.map((r) => `${r.id}:${r.kind}:${r.from_member}:${r.to_member}`).join('|');
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
