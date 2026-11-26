// Month grid for /events. Birthdays and anniversaries are stored once, on
// `events.occurs_on`, as the next occurrence only (sync_recurring_events and
// roll_forward_events). The year on that date is not the only year they
// happen: the calendar places them on the same month and day in whatever
// month is on screen. Meetups stay on the stored date.
//
// 29 February is kept on the 29th in leap years and shown on 28 February
// otherwise, matching sync_recurring_events. A birthday already saved as
// 28 February (the non-leap clamp) stays on the 28th, because the original
// day is no longer in the row.

import { daysInMonth, isLeapYear, MONTH_LABELS } from '@/lib/birthday';
import type { EventKind, FamilyEvent } from '@/lib/types';

const RECURRING_KINDS = new Set<EventKind>(['birthday', 'anniversary']);

export interface CalendarOccurrence {
  id: string;
  kind: EventKind;
  title: string;
  /** The day this occurrence is shown on (YYYY-MM-DD). */
  occursOn: string;
  memberId: string | null;
  venue: string | null;
  notes: string | null;
}

export interface CalendarDay {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarOccurrence[];
}

export interface CalendarMonth {
  year: number;
  month: number;
  label: string;
  weeks: CalendarDay[][];
}

export interface YearMonth {
  year: number;
  month: number;
}

export function istToday(now = new Date()): { year: number; month: number; day: number; iso: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { year, month, day, iso: isoFromParts(year, month, day) };
}

export function parseMonthParam(value: string | undefined, fallback: YearMonth): YearMonth {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return fallback;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12 || year < 1600 || year > 2400) return fallback;
  return { year, month };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function shiftMonth(year: number, month: number, delta: number): YearMonth {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

export function formatLongDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Sunday-start weeks covering `month` (1–12), including leading and trailing days. */
export function monthWeeks(year: number, month: number): string[][] {
  const firstIso = isoFromParts(year, month, 1);
  const first = parseIsoDate(firstIso);
  if (!first) return [];
  const dow = new Date(Date.UTC(first.year, first.month - 1, first.day)).getUTCDay();
  let cursor = addDays(firstIso, -dow);
  const lastIso = isoFromParts(year, month, daysInMonth(month, year));
  const weeks: string[][] = [];
  while (weeks.length < 6) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (week.includes(lastIso)) break;
  }
  return weeks;
}

export function buildCalendarMonth(
  events: FamilyEvent[],
  year: number,
  month: number,
  todayIso: string,
): CalendarMonth {
  const weeks = monthWeeks(year, month);
  const prefix = monthKey(year, month);
  const indexed = indexEvents(events);

  return {
    year,
    month,
    label: `${MONTH_LABELS[month - 1]} ${year}`,
    weeks: weeks.map((week) =>
      week.map((iso) => {
        const parsed = parseIsoDate(iso)!;
        return {
          iso,
          inMonth: iso.startsWith(prefix),
          isToday: iso === todayIso,
          events: eventsOnDay(indexed, parsed.year, parsed.month, parsed.day, iso),
        };
      }),
    ),
  };
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function indexEvents(events: FamilyEvent[]): {
  recurring: Map<string, FamilyEvent[]>;
  singles: Map<string, FamilyEvent[]>;
} {
  const recurring = new Map<string, FamilyEvent[]>();
  const singles = new Map<string, FamilyEvent[]>();
  for (const event of events) {
    const parsed = parseIsoDate(event.occurs_on);
    if (!parsed) continue;
    if (RECURRING_KINDS.has(event.kind)) {
      pushMap(recurring, monthDayKey(parsed.month, parsed.day), event);
    } else {
      pushMap(singles, isoFromParts(parsed.year, parsed.month, parsed.day), event);
    }
  }
  return { recurring, singles };
}

function eventsOnDay(
  indexed: { recurring: Map<string, FamilyEvent[]>; singles: Map<string, FamilyEvent[]> },
  year: number,
  month: number,
  day: number,
  iso: string,
): CalendarOccurrence[] {
  const found: FamilyEvent[] = [];
  found.push(...(indexed.singles.get(iso) ?? []));
  found.push(...(indexed.recurring.get(monthDayKey(month, day)) ?? []));
  // Stored 29 Feb belongs on 28 Feb when this year has no 29th.
  if (month === 2 && day === 28 && !isLeapYear(year)) {
    found.push(...(indexed.recurring.get('02-29') ?? []));
  }
  return found
    .map((event) => ({
      id: event.id,
      kind: event.kind,
      title: event.title,
      occursOn: iso,
      memberId: event.member_id,
      venue: event.venue,
      notes: event.notes,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id));
}

function pushMap(map: Map<string, FamilyEvent[]>, key: string, event: FamilyEvent) {
  const list = map.get(key);
  if (list) list.push(event);
  else map.set(key, [event]);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function monthDayKey(month: number, day: number): string {
  return `${pad2(month)}-${pad2(day)}`;
}

function addDays(iso: string, days: number): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return isoFromParts(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}
