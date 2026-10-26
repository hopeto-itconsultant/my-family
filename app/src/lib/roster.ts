// Roster import: converts a spreadsheet export (Birthday / Name /
// Nicknames-Petnames / ContactNo) into clean profile rows.
// Pure functions only — no I/O, no Supabase. Unit tested (npm test).

import { parseNicknames } from './nicknames';
import { normalizePhone } from './phone';

export interface ParsedRosterRow {
  full_name: string;
  nicknames: string[] | null;
  phone: string |            // canonical '91XXXXXXXXXX'
    | null;                  // when the sheet had no usable number
  birth_date: string | null;      // 'YYYY-MM-DD' when the year is known
  birth_year: number | null;      // recorded separately (migration 0010)
  birthday_hint: string | null;   // 'MM-DD' when only day+month are known
}

export interface ParseRosterResult {
  rows: ParsedRosterRow[];
  errors: string[]; // human-readable, with 1-based line numbers (header = line 1)
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "21 September 1982" → { month: 9, day: 21, year: 1982 } */
function parseBirthday(raw: string): { month: number; day: number; year: number | null } | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  // Numeric forms: YYYY-MM-DD or DD/MM/YYYY (or D/M/Y)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return { year: Number(y), month: Number(mo), day: Number(d) };
  }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return { year: Number(y), month: Number(mo), day: Number(d) };
  }

  // Textual forms: "31 July", "7 September 1984", "21 june".
  // Also tolerates "July 21" / "July 21, 1984" (month-first).
  m = s.match(
    /^([a-zA-Z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i,
  ) ?? s.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})\.?(?:,?\s+(\d{4}))?$/i,
  );
  if (m) {
    const first = m[1].toLowerCase().slice(0, 3);
    const second = m[2];
    const year = m[3] ? Number(m[3]) : null;
    let month: number | undefined;
    let day: number | undefined;
    if (first in MONTHS) {
      month = MONTHS[first];
      day = Number(second);
    } else {
      const key = second.toLowerCase().slice(0, 3);
      if (!(key in MONTHS)) return null;
      month = MONTHS[key];
      day = Number(first);
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    return { month, day, year };
  }

  return null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Split TSV/CSV lines honouring double-quoted fields.
 * A line containing tabs is treated as tab-separated (Excel copy-paste),
 * otherwise comma-separated.
 */
export function splitRosterLine(line: string): string[] {
  const delim = line.includes('\t') ? '\t' : ',';
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Normalize one sheet row [birthday, name, nicknames, contact]. */
export function mapRosterCells(cells: string[]): ParsedRosterRow | string {
  const [birthdayRaw = '', nameRaw = '', nickRaw = '', contactRaw = ''] = cells;
  const fullName = nameRaw.replace(/\s+/g, ' ').trim();
  if (!fullName) return 'missing name';

  const nicknames = parseNicknames(nickRaw);
  const phone = normalizePhone(contactRaw); // null when absent/short

  const bd = parseBirthday(birthdayRaw);
  let birth_date: string | null = null;
  let birth_year: number | null = null;
  let birthday_hint: string | null = null;
  if (bd) {
    if (bd.year !== null) {
      if (!isValidCalendarDate(bd.year, bd.month, bd.day)) return `impossible date "${birthdayRaw}"`;
      birth_year = bd.year;
      birth_date = `${bd.year}-${pad2(bd.month)}-${pad2(bd.day)}`;
    } else {
      birthday_hint = `${pad2(bd.month)}-${pad2(bd.day)}`;
    }
  } else if (birthdayRaw.trim()) {
    return `unreadable birthday "${birthdayRaw}"`;
  }

  return {
    full_name: fullName,
    nicknames: nicknames.length ? nicknames : null,
    phone,
    birth_date,
    birth_year,
    birthday_hint,
  };
}

/** Parse a whole pasted/exported roster (first line = header). */
export function parseRoster(text: string): ParseRosterResult {
  const rows: ParsedRosterRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows, errors: ['Empty input.'] };

  const header = lines[0].toLowerCase();
  if (!header.includes('name')) {
    errors.push('First line must be a header containing a "Name" column (Birthday, Name, Nicknames-Petnames, ContactNo).');
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRosterLine(lines[i]);
    const parsed = mapRosterCells(cells);
    if (typeof parsed === 'string') {
      errors.push(`Line ${i + 1}: ${parsed}.`);
    } else {
      rows.push(parsed);
    }
  }
  return { rows, errors };
}

/** Duplicate names within the sheet (case-insensitive). */
export function duplicateNames(rows: ParsedRosterRow[]): string[] {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = r.full_name.toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([n]) => n);
}
