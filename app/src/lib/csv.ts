// Phase 8: pure CSV parsing for bank statements. No I/O, no Supabase — unit tested.
// The output is fed to the `import_statement_batch()` Postgres function, which
// re-validates and converts amounts to integer paise server-side.

export interface StatementRow {
  date: string; // YYYY-MM-DD
  description: string;
  reference: string;
  amountRupees: string; // signed, e.g. "-1,500.00" or "2,500"
}

export interface ParseResult {
  rows: StatementRow[];
  skipped: number; // lines that looked like data but failed validation
  error?: string; // fatal problem (e.g. header not recognised)
}

/** Split one CSV line honouring double-quoted fields ("a,b",c → [a,b | c]). */
export function splitCsvLine(line: string): string[] {
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
    } else if (ch === ',') {
      out.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Also accepts DD/MM/YYYY and DD-MM-YYYY (common Indian bank exports). */
function normaliseDate(raw: string): string | null {
  const s = raw.trim();
  if (DATE_RE.test(s)) {
    const d = new Date(s + 'T00:00:00Z');
    return Number.isNaN(d.getTime()) ? null : s;
  }
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const day = Number(dd), mon = Number(mm);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return `${yyyy}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/** Signed rupee amount: strips thousands separators & ₹; rejects junk. */
export function parseAmountRupees(raw: string): string | null {
  const s = raw.replace(/₹|Rs\.?| /gi, '').replace(/,/g, '');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return s.startsWith('-') ? s : s.startsWith('+') ? s.slice(1) : s;
}

const HEADER_TOKENS = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date'],
  desc: ['narration', 'description', 'details', 'remarks', 'transaction details'],
  ref: ['reference', 'ref', 'utr', 'upi ref', 'chq/no', 'cheque no', 'ref no', 'transaction id'],
  debit: ['debit', 'withdrawal', 'dr', 'money out'],
  credit: ['credit', 'deposit', 'cr', 'money in'],
  amount: ['amount', 'rs', 'inr'],
};

type ColMap = Record<string, number>;

function findHeader(cells: string[]): ColMap | null {
  const lower = cells.map((c) => c.toLowerCase());
  const idx = (tokens: string[]) =>
    lower.findIndex((c) => tokens.some((t) => c === t || c.startsWith(t + ' ') || c.includes(t)));
  const map: ColMap = {};
  // 'value date'/'posting date' also contain "date"; prefer the first column
  // literally named date/txn date when present.
  const exact = (tokens: string[]) => lower.findIndex((c) => tokens.includes(c));
  const date = exact(['date', 'txn date', 'transaction date']);
  const dateFinal = date >= 0 ? date : idx(HEADER_TOKENS.date);
  const desc = idx(HEADER_TOKENS.desc);
  if (dateFinal < 0 || desc < 0) return null;
  map.date = dateFinal; map.desc = desc;
  map.ref = idx(HEADER_TOKENS.ref);
  const debit = idx(HEADER_TOKENS.debit);
  // "credit" as a standalone header, or UPI narrations like "UPI/CREDIT/…" —
  // require an exact column label to avoid matching narration text.
  const credit = exact(['credit', 'cr', 'money in']);
  const amount = exact(['amount']) >= 0 ? exact(['amount']) : idx(['rs', 'inr']);
  if (debit >= 0 && credit >= 0 && debit !== credit) {
    map.debit = debit; map.credit = credit;
  } else if (amount >= 0) {
    map.amount = amount;
  } else {
    return null;
  }
  return map;
}

/**
 * Parse a bank-statement CSV export. Tolerant of column order & naming across
 * banks; skips preamble/footer lines until it finds a header row. Rows with a
 * bad date or unparseable amount are counted as `skipped`, never guessed.
 */
export function parseStatementCsv(text: string): ParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0, error: 'The file is empty.' };

  let header: ColMap | null = null;
  let startIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    header = findHeader(splitCsvLine(lines[i]));
    if (header) { startIdx = i + 1; break; }
  }
  if (!header) {
    return { rows: [], skipped: 0, error: 'Could not find a header row with Date, Narration/Description and Amount (or Debit/Credit) columns.' };
  }

  const rows: StatementRow[] = [];
  let skipped = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length < 2) { skipped++; continue; }
    const get = (k: keyof ColMap) => (header![k] >= 0 ? cells[header![k]] ?? '' : '');
    const date = normaliseDate(get('date'));
    let amount: string | null;
    if (header!['amount'] !== undefined) {
      amount = parseAmountRupees(get('amount'));
    } else {
      const debit = parseAmountRupees(get('debit'));
      const credit = parseAmountRupees(get('credit'));
      // take whichever side has a value; debit becomes negative
      amount = credit ? credit : debit ? `-${debit.replace('-', '')}` : null;
    }
    const desc = get('desc');
    if (!date || !amount || !desc) { skipped++; continue; }
    rows.push({ date, description: desc.slice(0, 200), reference: get('ref').slice(0, 64), amountRupees: amount });
  }

  if (rows.length === 0) {
    return { rows: [], skipped, error: `No valid transaction rows found after the header (${skipped} line(s) skipped).` };
  }
  return { rows, skipped };
}

/** Suggest a batch label from the file name + date range of parsed rows. */
export function suggestLabel(fileName: string, rows: StatementRow[]): string {
  const base = fileName.replace(/\.csv$/i, '').replace(/[_\-]+/g, ' ').trim() || 'statement';
  if (rows.length === 0) return base;
  const dates = rows.map((r) => r.date).sort();
  return `${base} (${dates[0]} → ${dates[dates.length - 1]})`;
}
