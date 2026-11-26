import { NextResponse } from 'next/server';
import { endPreview } from '@/lib/view-as-session';
import { safeNextPath, VIEW_AS_COOKIE, type ViewAsEndReason } from '@/lib/view-as-policy';
import { viewAsCookieOptions } from '@/lib/view-as-cookie';

export const dynamic = 'force-dynamic';

function reasonOf(value: string | null): ViewAsEndReason {
  if (value === 'expired' || value === 'aborted') return value;
  return 'exit';
}

async function finish(request: Request, reason: ViewAsEndReason, nextPath: string) {
  await endPreview(reason);
  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set(VIEW_AS_COOKIE, '', viewAsCookieOptions(0));
  return response;
}

/** Banner button. Restores the admin's own session (their cookies never changed). */
export async function POST(request: Request) {
  const form = await request.formData();
  return finish(request, 'exit', safeNextPath(String(form.get('next') ?? '')));
}

/** Layout sends expired or unusable seals here so the cookie cannot linger. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return finish(
    request,
    reasonOf(url.searchParams.get('reason')),
    safeNextPath(url.searchParams.get('next')),
  );
}
