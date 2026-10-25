import Link from 'next/link';
import { Suspense } from 'react';
import { isSupabaseConfigured } from '@/lib/env';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 bg-gradient-to-b from-teal-900 to-teal-700 text-white">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-white/15 ring-1 ring-white/30 flex items-center justify-center text-3xl">
            🏡
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Our Family Home</h1>
          <p className="mt-1 text-teal-100 text-sm">
            A private place for our family — invitation only.
          </p>
        </div>

        {!isSupabaseConfigured() ? (
          <div className="rounded-2xl bg-white/10 ring-1 ring-white/20 p-5 text-sm space-y-2">
            <p className="font-semibold">Supabase is not connected yet</p>
            <p className="text-teal-100">
              Copy <code className="bg-black/20 px-1 rounded">.env.example</code>{' '}
              to <code className="bg-black/20 px-1 rounded">.env.local</code>,
              fill in your project URL and anon key, run{' '}
              <code className="bg-black/20 px-1 rounded">supabase db push</code>,
              then restart <code className="bg-black/20 px-1 rounded">npm run dev</code>.
            </p>
            <p className="text-teal-200/80">
              New relatives join via Supabase email invites — there is no public
              sign-up. Ask an admin for your invite.
            </p>
          </div>
        ) : (
          <Suspense>
            <LoginForm />
          </Suspense>
        )}

        <p className="mt-8 text-center text-xs text-teal-200/70">
          Trouble signing in?{' '}
          <Link href="/setup" className="underline">
            Setup guide
          </Link>
        </p>
      </div>
    </main>
  );
}
