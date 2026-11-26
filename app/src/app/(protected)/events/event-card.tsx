import type { EventKind } from '@/lib/types';

export const KIND_META: Record<EventKind, { icon: string; label: string; chip: string; dot: string }> = {
  birthday: {
    icon: '🎂',
    label: 'Birthday',
    chip: 'bg-amber-50 text-amber-950 ring-amber-200',
    dot: 'bg-amber-500',
  },
  anniversary: {
    icon: '💞',
    label: 'Anniversary',
    chip: 'bg-rose-50 text-rose-950 ring-rose-200',
    dot: 'bg-rose-500',
  },
  meetup: {
    icon: '📅',
    label: 'Meetup',
    chip: 'bg-teal-50 text-teal-900 ring-teal-200',
    dot: 'bg-teal-600',
  },
};

/** Shared event row. List items are not links; there is no event detail route. */
export function EventCard({
  kind,
  title,
  meta,
  notes,
  badge,
  badgeClassName,
}: {
  kind: EventKind;
  title: string;
  meta: string;
  notes: string | null;
  badge?: string;
  badgeClassName?: string;
}) {
  const info = KIND_META[kind];
  return (
    <div className="rounded-xl bg-white text-stone-900 ring-1 ring-stone-200 p-3 flex items-start gap-3">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 ring-1 ring-amber-200 flex items-center justify-center text-lg">
        {info.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm truncate">{title}</div>
        <div className="text-xs text-stone-500 mt-0.5">{meta}</div>
        {notes && <div className="text-xs text-stone-500 mt-1 italic">{notes}</div>}
      </div>
      {badge && (
        <span className={'shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 ' + (badgeClassName ?? '')}>
          {badge}
        </span>
      )}
    </div>
  );
}
