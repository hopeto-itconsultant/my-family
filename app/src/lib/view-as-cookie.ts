/**
 * Encrypted httpOnly cookie for a view-as preview. The seal holds the
 * member's access token so the admin's Supabase cookies can stay untouched.
 * The encryption key is the server-only service-role secret; the browser
 * cannot read the token.
 */

import { VIEW_AS_COOKIE } from './view-as-policy';

export type PreviewSeal = {
  v: 1;
  rowId: string;
  actorId: string;
  subjectId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export function previewSealSecret(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key && key.length > 0 ? key : null;
}

export function viewAsCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.max(0, maxAgeSeconds),
  };
}

export { VIEW_AS_COOKIE };

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`ofh-view-as-v1:${secret}`),
  );
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function bytesToB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function b64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function isSeal(value: unknown): value is PreviewSeal {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PreviewSeal>;
  return (
    v.v === 1 &&
    typeof v.rowId === 'string' &&
    typeof v.actorId === 'string' &&
    typeof v.subjectId === 'string' &&
    typeof v.accessToken === 'string' &&
    v.accessToken.length > 0 &&
    typeof v.refreshToken === 'string' &&
    v.refreshToken.length > 0 &&
    typeof v.expiresAt === 'number' &&
    Number.isFinite(v.expiresAt)
  );
}

export async function sealPreview(payload: PreviewSeal, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(secret);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return `v1.${bytesToB64Url(iv)}.${bytesToB64Url(cipher)}`;
}

export async function openPreview(token: string, secret: string): Promise<PreviewSeal | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  try {
    const iv = b64UrlToBytes(parts[1]);
    const data = b64UrlToBytes(parts[2]);
    const key = await aesKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(data),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as unknown;
    return isSeal(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort revoke of the preview GoTrue session only (`scope=local`). */
export async function revokePreviewAccessToken(accessToken: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !accessToken) return;
  try {
    await fetch(`${url.replace(/\/$/, '')}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // The cookie is still cleared. A later exit retries the revoke.
  }
}
