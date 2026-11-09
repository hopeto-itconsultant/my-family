'use client';

import { useId, useState } from 'react';
import { MONTH_LABELS, daysInMonth } from '@/lib/birthday';

/**
 * Birthday is day and month. The year is a separate optional field so a
 * relative whose birth year is unknown is not given an invented one.
 */
export function BirthdayFields({
  month: initialMonth = null,
  day: initialDay = null,
  year: initialYear = null,
  inputCls,
  labelCls,
}: {
  month?: number | null;
  day?: number | null;
  year?: number | null;
  inputCls: string;
  labelCls: string;
}) {
  const uid = useId();
  const monthId = `${uid}-month`;
  const dayId = `${uid}-day`;
  const yearId = `${uid}-year`;

  const [month, setMonth] = useState(initialMonth ? String(initialMonth) : '');
  const [day, setDay] = useState(initialDay ? String(initialDay) : '');
  const [year, setYear] = useState(initialYear ? String(initialYear) : '');

  const yearNum = /^\d{4}$/.test(year) ? Number(year) : null;
  const monthNum = month ? Number(month) : null;
  const maxDay = monthNum ? daysInMonth(monthNum, yearNum) : 31;
  // Keep an already-stored day visible even if it does not fit the selected year
  // (for example 29 February next to a non-leap year). Saving still rejects it.
  const listedMax = Math.max(maxDay, day && Number(day) <= 31 ? Number(day) : 0);

  function dayWithin(nextMonth: string, nextYear: string, currentDay: string): string {
    if (!currentDay || !nextMonth) return nextMonth ? currentDay : '';
    const y = /^\d{4}$/.test(nextYear) ? Number(nextYear) : null;
    return Number(currentDay) > daysInMonth(Number(nextMonth), y) ? '' : currentDay;
  }

  return (
    <>
      <p className={labelCls} id={`${uid}-birthday`}>Birthday</p>
      <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby={`${uid}-birthday`}>
        <div>
          <label htmlFor={monthId} className="sr-only">Birth month</label>
          <select
            id={monthId}
            name="birth_month"
            value={month}
            onChange={(e) => {
              const next = e.target.value;
              setMonth(next);
              setDay((current) => dayWithin(next, year, current));
            }}
            className={inputCls}
          >
            <option value="">Month</option>
            {MONTH_LABELS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={dayId} className="sr-only">Birth day</label>
          <select
            id={dayId}
            name="birth_day"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className={inputCls}
          >
            <option value="">Day</option>
            {Array.from({ length: listedMax }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-stone-500 mt-1">Day and month only — no year.</p>

      <label className={labelCls} htmlFor={yearId}>Birth year</label>
      <input
        id={yearId}
        name="birth_year"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        value={year}
        onChange={(e) => {
          const next = e.target.value;
          setYear(next);
          setDay((current) => dayWithin(month, next, current));
        }}
        className={inputCls}
        placeholder="Optional — only if the year is known"
      />
      <p className="text-xs text-stone-500 mt-1">Leave blank when the year is unknown. It is stored separately from the birthday.</p>
    </>
  );
}
