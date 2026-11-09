// Standard temporary password for logins an admin creates or resets.
//
//   first letter of the full name (uppercase) + "@" + day and month as DDMM
//
//   Akitoli, born 31 July        -> A@3107
//   Mary, born 21 September 1982 -> M@2109
//
// The year is never used. A full date lives in profiles.birth_date. When the
// year is unknown, profiles.birthday_hint stores the same day and month with
// sentinel year 2000 (or the importer's 'MM-DD' form). supabase/seed_roster.sql
// mirrors this formula in pg_temp.default_member_password — keep the two in step.

/** Supabase Auth's default minimum password length. The standard password is 6 characters. */
export const MIN_AUTH_PASSWORD_LENGTH = 6;

export const DEFAULT_PASSWORD_RULE =
  'Standard password: the first letter of the full name (uppercase), @, then the day and month as DDMM. Akitoli, born 31 July, is A@3107. The year is not used.';

const LETTER = /\p{L}/u;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const MONTH_DAY = /^(\d{1,2})-(\d{1,2})$/;

export interface BirthdayInput {
  /** 'YYYY-MM-DD' (any year). Preferred over birthdayHint when both are set. */
  birthDate?: string | null;
  /** 'YYYY-MM-DD' with sentinel year 2000, or 'MM-DD' when the year is unknown. */
  birthdayHint?: string | null;
}

function nameInitial(fullName: string): string | null {
  const match = LETTER.exec(fullName.normalize('NFC'));
  if (!match) return null;
  const upper = match[0].toLocaleUpperCase('en-US');
  return upper || null;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/** Day and month from an ISO date or an 'MM-DD' hint. Invalid calendar days return null. */
function parseDayMonth(raw: string | null | undefined): { day: number; month: number } | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = ISO_DATE.exec(s);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const md = MONTH_DAY.exec(s);
    if (!md) return null;
    // Hints without a year are validated against the sentinel leap year 2000,
    // so 29 February is accepted and 31 February is not.
    year = 2000;
    month = Number(md[1]);
    day = Number(md[2]);
  }
  if (!isRealDate(year, month, day)) return null;
  return { day, month };
}

function dayMonth(birthday: BirthdayInput): { day: number; month: number } | null {
  return parseDayMonth(birthday.birthDate) ?? parseDayMonth(birthday.birthdayHint);
}

/**
 * Standard password for this relative, or null when the name has no letter
 * or no real day and month is recorded. Always at least MIN_AUTH_PASSWORD_LENGTH
 * when it returns a string (one letter + "@" + DDMM).
 */
export function defaultMemberPassword(fullName: string, birthday: BirthdayInput): string | null {
  const initial = nameInitial(fullName);
  const dm = dayMonth(birthday);
  if (!initial || !dm) return null;
  const password = `${initial}@${String(dm.day).padStart(2, '0')}${String(dm.month).padStart(2, '0')}`;
  if (password.length < MIN_AUTH_PASSWORD_LENGTH) return null;
  return password;
}

export type ResolvedPassword =
  | { password: string; usedDefault: boolean }
  | { error: string };

/**
 * Password an admin is assigning on someone's behalf.
 * A non-empty custom password is used when it meets the auth minimum.
 * A blank one falls back to the standard password. With no birthday (and no
 * letter to take from the name), the admin has to type a password.
 */
export function resolveAdminPassword(input: {
  fullName: string;
  birthDate?: string | null;
  birthdayHint?: string | null;
  customPassword?: string | null;
}): ResolvedPassword {
  const custom = (input.customPassword ?? '').trim();
  if (custom) {
    if (custom.length < MIN_AUTH_PASSWORD_LENGTH) {
      return { error: `Password must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters.` };
    }
    return { password: custom, usedDefault: false };
  }
  const standard = defaultMemberPassword(input.fullName, {
    birthDate: input.birthDate,
    birthdayHint: input.birthdayHint,
  });
  if (!standard) {
    return {
      error:
        `No birthday is recorded, so a standard password cannot be made. Enter a temporary password (at least ${MIN_AUTH_PASSWORD_LENGTH} characters).`,
    };
  }
  return { password: standard, usedDefault: true };
}
