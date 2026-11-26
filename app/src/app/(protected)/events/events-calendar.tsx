'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatLongDate, shortEventLabel } from '@/lib/calendar';
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
const MOBILE_VISIBLE = 2;

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
      const target = document.getElementById(`month-day-${iso}`) ?? document.getElementById('month-events');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                  'min-w-0 overflow-hidden flex flex-col items-stretch gap-0.5 px-0.5 py-1 min-h-[4.25rem] md:gap-0.5 md:p-1.5 md:min-h-[6.75rem] text-left focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset ' +
                  (pressed ? 'focus-visible:ring-white ' : 'focus-visible:ring-teal-800 ') +
                  daySurface(day, pressed)
                }
              >
                <span
                  className={
                    'inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center self-center md:self-start rounded-full text-[11px] md:text-xs font-semibold ' +
                    dayNumberClass(day, pressed)
                  }
                >
                  {dayNum}
                </span>
                <span className="md:hidden flex flex-col gap-px min-w-0 w-full">
                  {day.events.slice(0, MOBILE_VISIBLE).map((item) => (
                    <span
                      key={item.id}
                      className={
                        'block min-w-0 truncate text-[11px] leading-[14px] font-medium ' +
                        (pressed ? 'text-white' : mobileLabelClass(item.kind, day))
                      }
                    >
                      {KIND_META[item.kind].icon} {shortEventLabel(item)}
                    </span>
                  ))}
                  {day.events.length > MOBILE_VISIBLE && (
                    <span className={'text-[11px] font-semibold leading-[14px] ' + (pressed ? 'text-white' : 'text-stone-500')}>
                      +{day.events.length - MOBILE_VISIBLE}
                    </span>
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

      <MonthEventList todayIso={todayIso} selectedIso={selectedDay?.iso ?? null} days={flat} />

      {selectedDay && (
        <section id="selected-day-events" className="hidden md:block scroll-mt-20 space-y-2" aria-live="polite">
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

function MonthEventList({
  todayIso,
  selectedIso,
  days,
}: {
  todayIso: string;
  selectedIso: string | null;
  days: CalendarDayItem[];
}) {
  const groups = days.filter((day) => day.inMonth && day.events.length > 0);
  const selected = days.find((day) => day.iso === selectedIso);
  const selectedEmpty = Boolean(selected && selected.inMonth && selected.events.length === 0);

  return (
    <section id="month-events" className="md:hidden scroll-mt-20 space-y-3" aria-label="Events this month">
      <h3 className="text-sm font-semibold text-stone-800">This month</h3>
      {groups.length === 0 ? (
        <p className="rounded-xl bg-white text-stone-500 ring-1 ring-stone-200 p-4 text-sm text-center">
          No events this month.
        </p>
      ) : (
        groups.map((day) => {
          const tone = dayTone(day.iso, todayIso);
          const highlighted = day.iso === selectedIso;
          return (
            <section
              key={day.iso}
              id={`month-day-${day.iso}`}
              className={
                'scroll-mt-20 space-y-2 rounded-xl p-2 ' +
                (tone === 'today' ? 'bg-teal-50 ' : tone === 'upcoming' ? 'bg-white ' : '') +
                (highlighted ? 'ring-2 ring-teal-700' : tone === 'upcoming' ? 'ring-1 ring-stone-200' : '')
              }
            >
              <h4 className={'text-sm font-semibold ' + (tone === 'past' ? 'text-stone-500' : 'text-stone-800')}>
                {formatLongDate(day.iso)}
                {tone === 'today' && <span className="ml-2 text-teal-700">Today</span>}
                {tone === 'upcoming' && <span className="ml-2 text-[11px] font-semibold text-amber-800">Upcoming</span>}
              </h4>
              <ul className="space-y-2">
                {day.events.map((item) => (
                  <li key={item.id}>
                    <EventCard kind={item.kind} title={item.title} meta={eventMeta(item)} notes={item.notes} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {selected && selectedEmpty && groups.length > 0 && (
        <p id={`month-day-${selected.iso}`} className="scroll-mt-20 rounded-xl bg-white text-stone-500 ring-1 ring-stone-200 p-4 text-sm text-center">
          Nothing on {formatLongDate(selected.iso)}.
        </p>
      )}
    </section>
  );
}

function dayTone(iso: string, todayIso: string): 'past' | 'today' | 'upcoming' {
  if (iso === todayIso) return 'today';
  return iso > todayIso ? 'upcoming' : 'past';
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

function mobileLabelClass(kind: EventKind, day: CalendarDayItem): string {
  if (!day.inMonth) return 'text-stone-500';
  if (kind === 'birthday') return 'text-amber-950';
  if (kind === 'anniversary') return 'text-rose-950';
  return 'text-teal-900';
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
