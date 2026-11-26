import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCalendarMonth,
  istToday,
  monthKey,
  parseMonthParam,
  shiftMonth,
} from './calendar';
import type { FamilyEvent } from './types';

function event(partial: Partial<FamilyEvent> & Pick<FamilyEvent, 'id' | 'kind' | 'occurs_on' | 'title'>): FamilyEvent {
  return {
    member_id: null,
    branch_id: null,
    venue: null,
    notes: null,
    ...partial,
  };
}

function day(calendar: ReturnType<typeof buildCalendarMonth>, iso: string) {
  return calendar.weeks.flat().find((d) => d.iso === iso);
}

test('IST today is the Kolkata calendar date, including late UTC evening', () => {
  assert.equal(istToday(new Date('2026-11-26T18:00:00Z')).iso, '2026-11-26');
  assert.equal(istToday(new Date('2026-11-26T20:00:00Z')).iso, '2026-11-27');
});

test('month param falls back when missing or impossible', () => {
  const fallback = { year: 2026, month: 11 };
  assert.deepEqual(parseMonthParam(undefined, fallback), fallback);
  assert.deepEqual(parseMonthParam('2026-13', fallback), fallback);
  assert.deepEqual(parseMonthParam('nope', fallback), fallback);
  assert.deepEqual(parseMonthParam('2026-03', fallback), { year: 2026, month: 3 });
});

test('shiftMonth crosses year boundaries', () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.equal(monthKey(2026, 3), '2026-03');
});

test('November 2026 starts on Sunday and covers trailing December days', () => {
  const calendar = buildCalendarMonth([], 2026, 11, '2026-11-26');
  assert.equal(calendar.label, 'November 2026');
  assert.equal(calendar.weeks[0][0].iso, '2026-11-01');
  assert.equal(calendar.weeks[0][0].inMonth, true);
  const flat = calendar.weeks.flat();
  assert.equal(flat.length % 7, 0);
  assert.equal(flat.at(-1)?.iso, '2026-12-05');
  assert.equal(day(calendar, '2026-11-26')?.isToday, true);
  assert.equal(day(calendar, '2026-12-01')?.inMonth, false);
  assert.equal(day(calendar, '2026-12-01')?.isToday, false);
});

test('yearly birthdays and anniversaries show in the viewed year, not the stored year', () => {
  const events = [
    event({
      id: 'bday',
      kind: 'birthday',
      title: 'Arun — Birthday',
      occurs_on: '2027-03-15',
      member_id: 'arun',
      notes: 'auto:birthday',
    }),
    event({
      id: 'ann',
      kind: 'anniversary',
      title: 'Meera — Anniversary',
      occurs_on: '2024-03-02',
      member_id: 'meera',
      notes: 'auto:anniversary',
    }),
  ];

  const march2026 = buildCalendarMonth(events, 2026, 3, '2026-11-26');
  const arun = day(march2026, '2026-03-15');
  assert.equal(arun?.events.length, 1);
  assert.equal(arun?.events[0].title, 'Arun — Birthday');
  assert.equal(arun?.events[0].occursOn, '2026-03-15');
  assert.equal(day(march2026, '2026-03-02')?.events[0].id, 'ann');

  const march2028 = buildCalendarMonth(events, 2028, 3, '2026-11-26');
  assert.equal(day(march2028, '2028-03-15')?.events[0].id, 'bday');
  assert.equal(day(march2028, '2028-04-15'), undefined);
  assert.equal(day(buildCalendarMonth(events, 2026, 4, '2026-11-26'), '2026-04-15')?.events.length, 0);
});

test('29 February birthdays land on the 29th in leap years and the 28th otherwise', () => {
  const events = [
    event({ id: 'leap', kind: 'birthday', title: 'Leap baby', occurs_on: '2028-02-29' }),
  ];
  const leap = buildCalendarMonth(events, 2028, 2, '2026-11-26');
  assert.equal(day(leap, '2028-02-29')?.events[0].id, 'leap');
  assert.equal(day(leap, '2028-02-28')?.events.length, 0);

  const common = buildCalendarMonth(events, 2026, 2, '2026-11-26');
  assert.equal(day(common, '2026-02-28')?.events[0].id, 'leap');
  assert.equal(day(common, '2026-02-29'), undefined);
});

test('meetups stay on the stored date and do not repeat', () => {
  const events = [
    event({ id: 'meet', kind: 'meetup', title: 'Family lunch', occurs_on: '2026-11-02', venue: 'Hall' }),
  ];
  const nov2026 = buildCalendarMonth(events, 2026, 11, '2026-11-26');
  assert.equal(day(nov2026, '2026-11-02')?.events[0].venue, 'Hall');
  const nov2027 = buildCalendarMonth(events, 2027, 11, '2026-11-26');
  assert.equal(day(nov2027, '2027-11-02')?.events.length, 0);
});

test('a meetup on a trailing day of the grid is visible, and titles sort within a day', () => {
  const events = [
    event({ id: 'z', kind: 'birthday', title: 'Zara — Birthday', occurs_on: '2010-12-01' }),
    event({ id: 'm', kind: 'meetup', title: 'Aunties meetup', occurs_on: '2026-12-01' }),
    event({ id: 'a', kind: 'anniversary', title: 'Anil — Anniversary', occurs_on: '1999-12-01' }),
  ];
  const nov = buildCalendarMonth(events, 2026, 11, '2026-11-26');
  const dec1 = day(nov, '2026-12-01');
  assert.deepEqual(
    dec1?.events.map((e) => e.id),
    ['a', 'm', 'z'],
  );
  assert.equal(dec1?.inMonth, false);

  const dec = buildCalendarMonth(events, 2026, 12, '2026-11-26');
  assert.equal(day(dec, '2026-12-01')?.inMonth, true);
  assert.equal(day(dec, '2026-12-01')?.events.length, 3);

  const nextYear = buildCalendarMonth(events, 2027, 12, '2026-11-26');
  assert.deepEqual(
    day(nextYear, '2027-12-01')?.events.map((e) => e.id),
    ['a', 'z'],
  );
});
