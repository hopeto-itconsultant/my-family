/**
 * All money in this app is stored and computed as INTEGER PAISE (1 INR = 100 paise).
 * Never use floating point for currency math — rounding errors compound in ledgers.
 */

export function formatPaise(paise: number, opts?: { compact?: boolean }): string {
  const abs = Math.abs(paise);
  const sign = paise < 0 ? '-' : '';
  if (opts?.compact) {
    if (abs >= 100 * 1000 * 1000) return `${sign}₹${(abs / (100 * 1000 * 1000)).toFixed(1)}Cr`;
    if (abs >= 100 * 1000) return `${sign}₹${(abs / (100 * 1000)).toFixed(1)}L`;
  }
  // Indian digit grouping (lakh style): 12,34,567
  const rupees = Math.floor(abs / 100);
  const p = String(abs % 100).padStart(2, '0');
  const s = String(rupees);
  let out = '';
  if (s.length > 3) {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest) parts.unshift(rest);
    out = parts.join(',') + ',' + last3;
  } else {
    out = s;
  }
  return `${sign}₹${out}.${p}`;
}

export function paiseFromRupeeInput(input: string): number | null {
  // Accept "1200", "1,200", "1200.50"
  const cleaned = input.replace(/[, ]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [r, f = ''] = cleaned.split('.');
  return Number(r) * 100 + Number(f.padEnd(2, '0') || 0);
}
