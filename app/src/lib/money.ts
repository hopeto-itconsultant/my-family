// Money is always integer paise (₹1 = 100 paise) end-to-end. Never floats.
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const inr = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(Math.round(Math.abs(paise) / 100));
  return sign + inr;
}

export function parseRupeesToPaise(input: string): number | null {
  const n = Number(input.replace(/[,₹\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
