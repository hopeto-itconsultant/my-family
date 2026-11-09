// Day + month birthdays. A known year is optional and stored separately.
// When the year is unknown, the day and month go in birthday_hint with the
// sentinel year 2000 (migration 0014) — that year is never a real birth year.

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTH_LENGTHS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** February allows the 29th when the year is unknown (the hint year 2000 is a leap year). */
export function daysInMonth(month: number, year: number | null): number {
  if (month < 1 || month > 12) return 31;
  if (month === 2) return year == null || isLeapYear(year) ? 29 : 28;
  return MONTH_LENGTHS[month];
}

export interface ResolvedBirthday {
  error?: string;
  birthDate: string | null;
  birthYear: number | null;
  /** 'YYYY-MM-DD' with year 2000, or null. Ready for profiles.birthday_hint. */
  birthdayHint: string | null;
}

const EMPTY: ResolvedBirthday = { birthDate: null, birthYear: null, birthdayHint: null };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Turn the edit-member day, month, and optional year into the columns the
 * profile row expects. Day and month are stored without inventing a year.
 */
export function resolveBirthday(
  monthRaw: string,
  dayRaw: string,
  yearRaw: string,
  nowYear = new Date().getFullYear(),
): ResolvedBirthday {
  const monthStr = monthRaw.trim();
  const dayStr = dayRaw.trim();
  const yearStr = yearRaw.trim();

  if ((monthStr && !dayStr) || (!monthStr && dayStr)) {
    return { ...EMPTY, error: 'Choose both the birth day and month, or leave both blank.' };
  }

  let birthYear: number | null = null;
  if (yearStr) {
    if (!/^\d{4}$/.test(yearStr)) return { ...EMPTY, error: 'Birth year must be a 4-digit year.' };
    birthYear = Number(yearStr);
    if (birthYear < 1850 || birthYear > nowYear) {
      return { ...EMPTY, error: 'Birth year must be between 1850 and this year.' };
    }
  }

  if (!monthStr && !dayStr) {
    return { birthDate: null, birthYear, birthdayHint: null };
  }

  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1) {
    return { ...EMPTY, error: 'Choose a valid birth day and month.' };
  }

  const max = daysInMonth(month, birthYear);
  if (day > max) {
    const when = birthYear ? ` in ${birthYear}` : '';
    return { ...EMPTY, error: `${day} ${MONTH_LABELS[month - 1]} is not a real date${when}.` };
  }

  if (birthYear) {
    return {
      birthDate: `${birthYear}-${pad2(month)}-${pad2(day)}`,
      birthYear,
      birthdayHint: null,
    };
  }

  return {
    birthDate: null,
    birthYear: null,
    birthdayHint: `2000-${pad2(month)}-${pad2(day)}`,
  };
}

export function birthdayParts(iso: string | null | undefined): { month: number | null; day: number | null } {
  if (!iso) return { month: null, day: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return { month: null, day: null };
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { month: null, day: null };
  return { month, day };
}

/** Prefill the day/month selects. A hint's sentinel year 2000 is not a birth year. */
export function memberBirthdayDefaults(member: {
  birth_date?: string | null;
  birth_year?: number | null;
  birthday_hint?: string | null;
}): { month: number | null; day: number | null; year: number | null } {
  const fromDate = birthdayParts(member.birth_date);
  const fromHint = birthdayParts(member.birthday_hint);
  const yearFromDate =
    member.birth_date && /^\d{4}/.test(member.birth_date)
      ? Number(member.birth_date.slice(0, 4))
      : null;
  return {
    month: fromDate.month ?? fromHint.month,
    day: fromDate.day ?? fromHint.day,
    year: member.birth_year ?? yearFromDate,
  };
}
