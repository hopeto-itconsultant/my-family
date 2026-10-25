'use client';

import { useSearchParams } from 'next/navigation';
import { signInWithPassword } from '@/app/actions/auth';

export function LoginForm() {
  const params = useSearchParams();
  const error = params.get('error');
  const next = params.get('next') ?? '/';

  return (
    <form
      action={signInWithPassword}
      className="rounded-2xl bg-white text-stone-900 shadow-xl p-6 space-y-4"
    >
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email (the one your admin invited)
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-500"
          placeholder="you@family.example"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-500"
          placeholder="••••••••"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="w-full rounded-xl bg-teal-700 py-3 text-base font-semibold text-white active:scale-[0.99] transition disabled:opacity-60"
      >
        Sign in
      </button>
      <p className="text-xs text-stone-500 text-center">
        First person to create an account becomes the family Admin.
      </p>
    </form>
  );
}
