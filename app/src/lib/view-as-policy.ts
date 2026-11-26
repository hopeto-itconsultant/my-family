/**
 * Rules for the admin "View as" preview. Pure: no cookies, no database.
 * The database (migration 0019) is what actually stops writes. These helpers
 * decide the same questions in the app so buttons and server actions agree.
 */

export const VIEW_AS_TTL_MS = 30 * 60 * 1000;

export const VIEW_AS_COOKIE = 'ofh_view_as';

export const VIEW_AS_EXIT_PATH = '/view-as/exit';

/** Shown on the banner and returned by blocked writes. */
export const VIEW_AS_READ_ONLY =
  'This preview is read-only. Exit “View as” before making changes.';

/**
 * Directory-only relatives have a profile and no auth user. RLS identities
 * are auth.uid(), so there is no session that shows what they would see.
 */
export const VIEW_AS_NO_LOGIN =
  'No login yet. View as follows their real sign-in and permissions; link an account first.';

export const VIEW_AS_NOT_ADMIN = 'Only an admin can view the app as another member.';

export type ViewAsEndReason = 'exit' | 'expired' | 'aborted';

export type ViewAsStartInput = {
  actorRole: string | null | undefined;
  actorId: string | null;
  subjectId: string;
  subjectHasLogin: boolean;
  previewActive: boolean;
};

/** null means the admin may start a preview. Anything else is the refusal. */
export function decideViewAsStart(input: ViewAsStartInput): string | null {
  if (input.previewActive) return VIEW_AS_READ_ONLY;
  if (!input.actorId) return 'Sign in as an admin.';
  if (input.actorRole !== 'admin') return VIEW_AS_NOT_ADMIN;
  if (!input.subjectId) return 'Choose a member to view as.';
  if (input.actorId === input.subjectId) return 'That is already your own account.';
  if (!input.subjectHasLogin) return VIEW_AS_NO_LOGIN;
  return null;
}

/** Non-null when a mutation must be refused. */
export function viewAsWriteBlocked(previewActive: boolean): string | null {
  return previewActive ? VIEW_AS_READ_ONLY : null;
}

/** Earlier of "30 minutes from start" and the GoTrue access-token expiry. */
export function previewDeadline(startedAtMs: number, tokenExpMs: number | null): number {
  const cap = startedAtMs + VIEW_AS_TTL_MS;
  if (tokenExpMs == null || !Number.isFinite(tokenExpMs)) return cap;
  return Math.min(cap, tokenExpMs);
}

export function previewIsCurrent(expiresAt: number, now: number): boolean {
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/**
 * POST mutations are refused while a current preview belongs to this signed-in
 * admin. Exit is the one POST that must get through. Reads (GET) stay open.
 */
export function previewBlocksMutation(input: {
  method: string;
  pathname: string;
  actorId: string | null;
  seal: { actorId: string; expiresAt: number } | null;
  now: number;
}): boolean {
  if (!input.seal) return false;
  if (input.method !== 'POST') return false;
  if (input.pathname === VIEW_AS_EXIT_PATH || input.pathname.startsWith(`${VIEW_AS_EXIT_PATH}/`)) {
    return false;
  }
  if (!input.actorId || input.actorId !== input.seal.actorId) return false;
  return previewIsCurrent(input.seal.expiresAt, input.now);
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return '/members';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/members';
  if (value.startsWith(VIEW_AS_EXIT_PATH)) return '/members';
  return value;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Boolean true only. A string "true" stuffed into another claim does not count. */
export function tokenIsReadOnlyPreview(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const app = payload.app_metadata;
  if (!app || typeof app !== 'object' || Array.isArray(app)) return false;
  return (app as Record<string, unknown>).impersonation === true;
}

export function jwtSessionId(payload: Record<string, unknown> | null): string | null {
  const sid = payload?.session_id;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}

export function jwtExpiryMs(payload: Record<string, unknown> | null): number | null {
  const exp = payload?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMemberId(value: string): boolean {
  return UUID_RE.test(value);
}
