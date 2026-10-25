/** Phone helpers — keep in sync with public.normalize_phone() in migration 0007. */

/** Strip all non-digits, drop leading 0s / country code, return last 10 digits (or null). */
export function tenDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** Canonical form used for uniqueness + shadow emails: '91' + 10 digits. */
export function normalizePhone(raw: string): string | null {
  const ten = tenDigits(raw);
  return ten ? `91${ten}` : null;
}

/** Display like +91 98765 43210. */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const ten = tenDigits(raw);
  if (!ten) return raw;
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

/** Loose client-side validation: 10 digits after normalization. */
export function isValidPhoneInput(raw: string): boolean {
  return tenDigits(raw) !== null;
}
