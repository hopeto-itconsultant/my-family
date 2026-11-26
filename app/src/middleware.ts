import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { openPreview, VIEW_AS_COOKIE } from '@/lib/view-as-cookie';
import { previewBlocksMutation } from '@/lib/view-as-policy';

/**
 * Refreshes the Supabase session cookie on every request and enforces the
 * auth gate. NOTE: this is UX-level routing only — real permission enforcement
 * lives in Postgres RLS (see supabase/migrations/0001_init.sql). If env vars
 * are missing (preview without Supabase), it passes through so the setup
 * screen can render.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith('/login') || path.startsWith('/auth');

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rawPreview = request.cookies.get(VIEW_AS_COOKIE)?.value;
  const seal = secret && rawPreview ? await openPreview(rawPreview, secret) : null;
  if (
    previewBlocksMutation({
      method: request.method,
      pathname: path,
      actorId: user?.id ?? null,
      seal,
      now: Date.now(),
    })
  ) {
    const denied = new NextResponse(
      'This preview is read-only. Use Exit to return to your own account.',
      { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    return denied;
  }

  if (!user && !isAuthPage) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path);
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    if (rawPreview) redirect.cookies.set(VIEW_AS_COOKIE, '', { path: '/', maxAge: 0 });
    return redirect;
  }
  if (user && path === '/login') {
    const home = NextResponse.redirect(new URL('/', request.url));
    response.cookies.getAll().forEach((cookie) => home.cookies.set(cookie));
    return home;
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)'],
};
