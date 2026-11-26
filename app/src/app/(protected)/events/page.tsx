import Link from 'next/link';
import { requireProfile, getUpcomingEvents, getEvents, getDirectory, canManage } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import {
  buildCalendarMonth,
  istToday,
  monthKey,
  parseMonthParam,
  shiftMonth,
} from '@/lib/calendar';
import type { FamilyEvent } from '@/lib/types';
import { AddEventSheet } from './add-event';
import { EventCard } from './event-card';
import { EventsCalendar, type CalendarDayItem } from './events-calendar';
import { EventsViewToggle } from './view-toggle';

export const metadata = { title: 'Events · Our Family Home' };

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function countdown(days: number): { label: string; className: string } {
  if (days === 0) return { label: 'Today 🎉', className: 'bg-emerald-100 text-emerald-800' };
  if (days === 1) return { label: 'Tomorrow', className: 'bg-amber-100 text-amber-800' };
  if (days <= 7) return { label: `in ${days} days`, className: 'bg-amber-100 text-amber-800' };
  return { label: `in ${days} days`, className: 'bg-stone-100 text-stone-600' };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const view = sp.view === 'calendar' ? 'calendar' : 'list';
  const supabase = await createClient();

  const [events, people, branchRes] = await Promise.all([
    view === 'calendar' ? getEvents() : getUpcomingEvents(60),
    getDirectory(),
    supabase.from('branches').select('id, name').order('order_hint'),
  ]);
  const branches = (branchRes.data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const leader = canManage(profile);

  const today = istToday();
  const shown = view === 'calendar' ? parseMonthParam(sp.month, today) : today;
  const calendarHref =
    view === 'calendar'
      ? `/events?view=calendar&month=${monthKey(shown.year, shown.month)}`
      : '/events?view=calendar';

  return (
    <div
      className={
        'px-4 py-6 mx-auto space-y-5 ' + (view === 'calendar' ? 'max-w-lg md:max-w-4xl' : 'max-w-lg')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Birthdays &amp; meetups</h1>
          <p className="text-sm text-stone-500 mt-1">
            {view === 'list' ? listSummary(events) : 'Switch months to see the whole year. Yearly dates repeat.'}
          </p>
        </div>
        <AddEventSheet
          people={people.map((p) => ({ id: p.id, name: p.full_name }))}
          branches={branches}
        />
      </div>

      <EventsViewToggle view={view} calendarHref={calendarHref} />

      {view === 'list' ? (
        <EventList events={events} names={names} />
      ) : (
        <CalendarSection events={events} names={names} year={shown.year} month={shown.month} todayIso={today.iso} />
      )}

      <p className="text-[11px] leading-relaxed text-stone-500">
        {leader
          ? 'As treasurer you can add and remove any event. Every change is visible to the whole family.'
          : 'Members may add their own birthday. Ask the treasurer to add anniversaries or meetups.'}
      </p>
    </div>
  );
}

function listSummary(events: FamilyEvent[]): string {
  if (events.length === 0) return 'Nothing in the next 60 days.';
  return `${events.length} event${events.length > 1 ? 's' : ''} in the next 60 days`;
}

function EventList({ events, names }: { events: FamilyEvent[]; names: Map<string, string> }) {
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
    const list = byMonth.get(key) ?? [];
    list.push(event);
    byMonth.set(key, list);
  }

  return (
    <div className="space-y-6" role="tabpanel" aria-label="List">
      {[...byMonth.entries()].map(([key, list]) => (
        <section key={key}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
            {new Date(key + '-01T00:00:00').toLocaleDateString('en-IN', {
              month: 'long',
              year: 'numeric',
              timeZone: 'Asia/Kolkata',
            })}
          </h2>
          <ul className="space-y-2">
            {list.map((event) => {
              const who = event.member_id ? names.get(event.member_id) : null;
              const meta = [
                formatDate(event.occurs_on),
                who ? `for ${who}` : null,
                event.venue,
              ]
                .filter(Boolean)
                .join(' · ');
              const badge = countdown(daysUntil(event.occurs_on));
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

function CalendarSection({
  events,
  names,
  year,
  month,
  todayIso,
}: {
  events: FamilyEvent[];
  names: Map<string, string>;
  year: number;
  month: number;
  todayIso: string;
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
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const inMonthCount = weeks
    .flat()
    .reduce((sum, day) => sum + (day.inMonth ? day.events.length : 0), 0);

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
        prevHref={`/events?view=calendar&month=${monthKey(prev.year, prev.month)}`}
        nextHref={`/events?view=calendar&month=${monthKey(next.year, next.month)}`}
        todayHref="/events?view=calendar"
        weeks={weeks}
      />
    </div>
  );
}
