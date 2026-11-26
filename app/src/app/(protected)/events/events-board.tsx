'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  buildCalendarMonth,
  daysBetween,
  monthKey,
  parseMonthParam,
  shiftMonth,
  upcomingEvents,
} from '@/lib/calendar';
import type { FamilyEvent } from '@/lib/types';
import { AddEventSheet } from './add-event';
import { EventCard } from './event-card';
import { EventsCalendar, type CalendarDayItem } from './events-calendar';
import { EventsViewToggle } from './view-toggle';

const LIST_DAYS = 60;

/**
 * List and calendar share one payload. Changing the view or the month only
 * updates React state and the address bar, so those taps do not wait on
 * another server render.
 */
export function EventsBoard({
  events,
  people,
  branches,
  leader,
  todayIso,
  initialView,
  initialMonth,
}: {
  events: FamilyEvent[];
  people: { id: string; full_name: string }[];
  branches: { id: string; name: string }[];
  leader: boolean;
  todayIso: string;
  initialView: 'list' | 'calendar';
  initialMonth: string;
}) {
  const [view, setView] = useState(initialView);
  const [month, setMonth] = useState(initialMonth);
  const names = useMemo(() => new Map(people.map((person) => [person.id, person.full_name])), [people]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setView(params.get('view') === 'calendar' ? 'calendar' : 'list');
      const parsed = parseMonthParam(params.get('month') ?? undefined, {
        year: Number(month.slice(0, 4)),
        month: Number(month.slice(5, 7)),
      });
      if (params.get('month')) setMonth(monthKey(parsed.year, parsed.month));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [month]);

  function publish(nextView: 'list' | 'calendar', nextMonth: string) {
    const url = new URL(window.location.href);
    if (nextView === 'calendar') {
      url.searchParams.set('view', 'calendar');
      url.searchParams.set('month', nextMonth);
    } else {
      url.searchParams.delete('view');
      url.searchParams.delete('month');
    }
    const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '');
    window.history.pushState(null, '', next);
  }

  function show(nextView: 'list' | 'calendar') {
    if (nextView === view) return;
    setView(nextView);
    publish(nextView, month);
  }

  function moveMonth(delta: number) {
    const [year, monthNum] = month.split('-').map(Number);
    const shifted = shiftMonth(year, monthNum, delta);
    const next = monthKey(shifted.year, shifted.month);
    setMonth(next);
    publish('calendar', next);
  }

  function jumpToday() {
    const current = todayIso.slice(0, 7);
    setView('calendar');
    setMonth(current);
    publish('calendar', current);
  }

  const shown = parseMonthParam(month, {
    year: Number(todayIso.slice(0, 4)),
    month: Number(todayIso.slice(5, 7)),
  });
  const list = upcomingEvents(events, todayIso, LIST_DAYS);

  return (
    <div className={'px-4 py-6 mx-auto space-y-5 ' + (view === 'calendar' ? 'max-w-lg md:max-w-4xl' : 'max-w-lg')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Birthdays &amp; meetups</h1>
          <p className="text-sm text-stone-500 mt-1">
            {view === 'list'
              ? listSummary(list.length)
              : 'Switch months to see the whole year. Yearly dates repeat.'}
          </p>
        </div>
        <AddEventSheet
          people={people.map((person) => ({ id: person.id, name: person.full_name }))}
          branches={branches}
        />
      </div>

      <EventsViewToggle view={view} onChange={show} />

      {view === 'list' ? (
        <EventList events={list} names={names} todayIso={todayIso} />
      ) : (
        <CalendarPane events={events} names={names} year={shown.year} month={shown.month} todayIso={todayIso} onPrevious={() => moveMonth(-1)} onNext={() => moveMonth(1)} onToday={jumpToday} />
      )}

      <p className="text-[11px] leading-relaxed text-stone-500">
        {leader
          ? 'As treasurer you can add and remove any event. Every change is visible to the whole family.'
          : 'Members may add their own birthday. Ask the treasurer to add anniversaries or meetups.'}
      </p>
    </div>
  );
}

function listSummary(count: number): string {
  if (count === 0) return 'Nothing in the next 60 days.';
  return `${count} event${count > 1 ? 's' : ''} in the next 60 days`;
}

function EventList({
  events,
  names,
  todayIso,
}: {
  events: FamilyEvent[];
  names: Map<string, string>;
  todayIso: string;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-6 text-center space-y-3">
        <div className="text-3xl" aria-hidden>
          🗓️
        </div>
        <p className="text-sm text-stone-600">
          Coordinators add anniversaries and meetups here. You can add your own
          birthday — recurring dates roll forward automatically each year.
        </p>
        <Link href="/directory" className="inline-block text-sm font-medium text-teal-700 underline">
          Find relatives in the directory →
        </Link>
      </div>
    );
  }

  const byMonth = new Map<string, FamilyEvent[]>();
  for (const event of events) {
    const key = event.occurs_on.slice(0, 7);
    const group = byMonth.get(key) ?? [];
    group.push(event);
    byMonth.set(key, group);
  }

  return (
    <div className="space-y-6" role="tabpanel" aria-label="List">
      {[...byMonth.entries()].map(([key, group]) => (
        <section key={key}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
            {formatMonth(key)}
          </h2>
          <ul className="space-y-2">
            {group.map((event) => {
              const who = event.member_id ? names.get(event.member_id) : null;
              const meta = [formatDate(event.occurs_on), who ? `for ${who}` : null, event.venue]
                .filter(Boolean)
                .join(' · ');
              const badge = countdown(daysBetween(todayIso, event.occurs_on.slice(0, 10)) ?? 0);
              return (
                <li key={event.id}>
                  <EventCard
                    kind={event.kind}
                    title={event.title}
                    meta={meta}
                    notes={event.notes}
                    badge={badge.label}
                    badgeClassName={badge.className}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CalendarPane({
  events,
  names,
  year,
  month,
  todayIso,
  onPrevious,
  onNext,
  onToday,
}: {
  events: FamilyEvent[];
  names: Map<string, string>;
  year: number;
  month: number;
  todayIso: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const calendar = buildCalendarMonth(events, year, month, todayIso);
  const weeks: CalendarDayItem[][] = calendar.weeks.map((week) =>
    week.map((day) => ({
      iso: day.iso,
      inMonth: day.inMonth,
      isToday: day.isToday,
      events: day.events.map((event) => ({
        id: event.id,
        kind: event.kind,
        title: event.title,
        who: event.memberId ? (names.get(event.memberId) ?? null) : null,
        venue: event.venue,
        notes: event.notes,
      })),
    })),
  );
  const inMonthCount = weeks.flat().reduce((sum, day) => sum + (day.inMonth ? day.events.length : 0), 0);

  return (
    <div role="tabpanel" aria-label="Calendar" className="space-y-3">
      <p className="text-sm text-stone-500">
        {inMonthCount === 0
          ? `Nothing in ${calendar.label}.`
          : `${inMonthCount} event${inMonthCount === 1 ? '' : 's'} in ${calendar.label}.`}
      </p>
      <EventsCalendar
        key={monthKey(year, month)}
        label={calendar.label}
        todayIso={todayIso}
        isCurrentMonth={todayIso.startsWith(monthKey(year, month))}
        onPrevious={onPrevious}
        onNext={onNext}
        onToday={onToday}
        weeks={weeks}
      />
    </div>
  );
}

function formatMonth(key: string): string {
  return new Date(key + '-01T00:00:00Z').toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDate(iso: string): string {
  return new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function countdown(days: number): { label: string; className: string } {
  if (days === 0) return { label: 'Today 🎉', className: 'bg-emerald-100 text-emerald-800' };
  if (days === 1) return { label: 'Tomorrow', className: 'bg-amber-100 text-amber-800' };
  if (days > 1 && days <= 7) return { label: `in ${days} days`, className: 'bg-amber-100 text-amber-800' };
  if (days > 7) return { label: `in ${days} days`, className: 'bg-stone-100 text-stone-600' };
  return { label: `${Math.abs(days)} days ago`, className: 'bg-stone-100 text-stone-600' };
}
