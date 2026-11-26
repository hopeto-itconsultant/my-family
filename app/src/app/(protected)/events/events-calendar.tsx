'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatLongDate } from '@/lib/calendar';
import type { EventKind } from '@/lib/types';
import { EventCard, KIND_META } from './event-card';

export interface CalendarEventItem {
  id: string;
  kind: EventKind;
  title: string;
  who: string | null;
  venue: string | null;
  notes: string | null;
}

export interface CalendarDayItem {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEventItem[];
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const DESKTOP_VISIBLE = 2;

export function EventsCalendar({
  label,
  todayIso,
  isCurrentMonth,
  prevHref,
  nextHref,
  todayHref,
  weeks,
}: {
  label: string;
  todayIso: string;
  isCurrentMonth: boolean;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  weeks: CalendarDayItem[][];
}) {
  const flat = weeks.flat();
  const initial = flat.find((day) => day.isToday)?.iso ?? flat.find((day) => day.inMonth)?.iso ?? flat[0]?.iso ?? todayIso;
  const [selected, setSelected] = useState(initial);
  const selectedDay = flat.find((day) => day.iso === selected) ?? flat.find((day) => day.inMonth) ?? flat[0];

  function selectDay(iso: string) {
    setSelected(iso);
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    requestAnimationFrame(() => {
      document.getElementById('selected-day-events')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <Link
            href={prevHref}
            scroll={false}
            aria-label="Previous month"
            className="h-9 w-9 shrink-0 rounded-lg bg-white ring-1 ring-stone-300 font-bold text-stone-700 grid place-items-center active:bg-stone-100"
          >
            ‹
          </Link>
          <h2 className="text-base font-bold text-stone-900 tabular-nums px-1 truncate">{label}</h2>
          <Link
            href={nextHref}
            scroll={false}
            aria-label="Next month"
            className="h-9 w-9 shrink-0 rounded-lg bg-white ring-1 ring-stone-300 font-bold text-stone-700 grid place-items-center active:bg-stone-100"
          >
            ›
          </Link>
        </div>
        <Link
          href={todayHref}
          scroll={false}
          onClick={(event) => {
            if (!isCurrentMonth) return;
            event.preventDefault();
            selectDay(todayIso);
          }}
          className="h-9 shrink-0 rounded-lg bg-white ring-1 ring-stone-300 px-3 text-sm font-semibold text-teal-800 grid place-items-center active:bg-stone-100"
        >
          Today
        </Link>
      </div>

      <div className="rounded-2xl overflow-hidden ring-1 ring-stone-200 bg-stone-200">
        <div className="grid grid-cols-7 gap-px" aria-label={`${label} calendar. Week starts on Sunday.`}>
          {WEEKDAYS.map((name) => (
            <div
              key={name}
              className="bg-stone-50 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500"
            >
              {name}
            </div>
          ))}
          {flat.map((day) => {
            const pressed = day.iso === selectedDay?.iso;
            const dayNum = Number(day.iso.slice(8, 10));
            const extra = day.events.length - DESKTOP_VISIBLE;
            return (
              <button
                key={day.iso}
                type="button"
                aria-pressed={pressed}
                aria-current={day.isToday ? 'date' : undefined}
                aria-label={dayAria(day)}
                onClick={() => selectDay(day.iso)}
                className={
                  'min-w-0 overflow-hidden flex flex-col items-center gap-1 px-0.5 py-1.5 min-h-[3.25rem] md:items-stretch md:gap-0.5 md:p-1.5 md:min-h-[6.75rem] text-left focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset ' +
                  (pressed ? 'focus-visible:ring-white ' : 'focus-visible:ring-teal-800 ') +
                  daySurface(day, pressed)
                }
              >
                <span
                  className={
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold md:self-start ' +
                    dayNumberClass(day, pressed)
                  }
                >
                  {dayNum}
                </span>
                <span className="md:hidden flex items-center justify-center gap-0.5 min-h-2">
                  {day.events.length > 3 ? (
                    <span
                      className={
                        'text-[10px] font-bold leading-none rounded-full px-1 ' +
                        (pressed ? 'text-white' : 'text-stone-600')
                      }
                    >
                      {day.events.length}
                    </span>
                  ) : (
                    day.events.map((item) => (
                      <span
                        key={item.id}
                        className={'h-1.5 w-1.5 rounded-full ' + (pressed ? 'bg-white' : KIND_META[item.kind].dot)}
                      />
                    ))
                  )}
                </span>
                <span className="hidden md:flex flex-col gap-0.5 min-w-0">
                  {day.events.slice(0, DESKTOP_VISIBLE).map((item) => (
                    <span
                      key={item.id}
                      className={
                        'block min-w-0 truncate rounded px-1 py-0.5 text-[11px] leading-4 ring-1 ' +
                        (pressed ? 'bg-white/15 text-white ring-white/20' : KIND_META[item.kind].chip)
                      }
                    >
                      {KIND_META[item.kind].icon} {item.title}
                    </span>
                  ))}
                  {extra > 0 && (
                    <span className={'px-1 text-[10px] font-semibold ' + (pressed ? 'text-white' : 'text-stone-500')}>
                      +{extra} more
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500 md:hidden" aria-hidden>
        {(Object.keys(KIND_META) as EventKind[]).map((kind) => (
          <li key={kind} className="inline-flex items-center gap-1">
            <span className={'h-1.5 w-1.5 rounded-full ' + KIND_META[kind].dot} />
            {KIND_META[kind].label}
          </li>
        ))}
      </ul>

      {selectedDay && (
        <section id="selected-day-events" className="scroll-mt-20 space-y-2" aria-live="polite">
          <h3 className="text-sm font-semibold text-stone-800">
            {formatLongDate(selectedDay.iso)}
            {selectedDay.isToday && <span className="ml-2 text-teal-700 font-semibold">Today</span>}
          </h3>
          {selectedDay.events.length === 0 ? (
            <p className="rounded-xl bg-white text-stone-500 ring-1 ring-stone-200 p-4 text-sm text-center">
              Nothing on this day.
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedDay.events.map((item) => (
                <li key={item.id}>
                  <EventCard
                    kind={item.kind}
                    title={item.title}
                    meta={eventMeta(item)}
                    notes={item.notes}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function daySurface(day: CalendarDayItem, pressed: boolean): string {
  if (pressed) return 'bg-teal-700 text-white';
  if (day.isToday) return 'bg-teal-50 text-stone-900';
  if (!day.inMonth) return 'bg-stone-50 text-stone-400 hover:bg-stone-100';
  return 'bg-white text-stone-900 hover:bg-stone-50';
}

function dayNumberClass(day: CalendarDayItem, pressed: boolean): string {
  if (pressed) return 'bg-white text-teal-800';
  if (day.isToday) return 'bg-teal-700 text-white';
  if (!day.inMonth) return 'text-stone-400';
  return 'text-stone-800';
}

function dayAria(day: CalendarDayItem): string {
  const when = formatLongDate(day.iso);
  if (day.events.length === 0) return `${when}, no events`;
  const names = day.events.map((item) => item.title).join(', ');
  const noun = day.events.length === 1 ? 'event' : 'events';
  return `${when}, ${day.events.length} ${noun}: ${names}`;
}

function eventMeta(item: CalendarEventItem): string {
  const bits = [KIND_META[item.kind].label];
  if (item.who) bits.push(`for ${item.who}`);
  if (item.venue) bits.push(item.venue);
  return bits.join(' · ');
}
