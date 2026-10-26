'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { signInWithPhone, signInWithEmail } from '@/app/actions/auth';

export function LoginForm() {
  const params = useSearchParams();
  const error = params.get('error');
  const next = params.get('next') ?? '/';
  const [mode, setMode] = useState<'phone' | 'email'>(
    params.get('mode') === 'email' ? 'email' : 'phone',
  );

  return (
    <div className="rounded-2xl bg-white text-stone-900 shadow-xl p-6 space-y-4">
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode('phone')}
          className={`rounded-lg py-2 transition ${mode === 'phone' ? 'bg-white shadow text-teal-800' : 'text-stone-500'}`}
        >
          📱 Mobile number
        </button>
        <button
          type="button"
          onClick={() => setMode('email')}
          className={`rounded-lg py-2 transition ${mode === 'email' ? 'bg-white shadow text-teal-800' : 'text-stone-500'}`}
        >
          ✉️ Email
        </button>
      </div>

      {mode === 'phone' ? (
        <form action={signInWithPhone} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-1">
              Registered mobile number
            </label>
            <div className="flex items-stretch rounded-xl border border-stone-300 focus-within:ring-2 focus-within:ring-teal-500 overflow-hidden">
              <span className="flex items-center px-3 bg-stone-50 text-stone-500 text-sm border-r border-stone-200 select-none">
                +91
              </span>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                required
                maxLength={15}
                pattern="[0-9\s+\-]{10,15}"
                className="flex-1 px-4 py-3 text-base focus:outline-none"
                placeholder="98765 43210"
              />
            </div>
            <p className="mt-1.5 text-xs text-stone-500">
              The number your admin registered for you in the family directory.
            </p>
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
            <p className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            className="w-full rounded-xl bg-teal-700 py-3 text-base font-semibold text-white active:scale-[0.99] transition disabled:opacity-60"
          >
            Sign in
          </button>
        </form>
      ) : (
        <form action={signInWithEmail} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email (if you were invited by email)
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
            <label htmlFor="password-email" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password-email"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            className="w-full rounded-xl bg-teal-700 py-3 text-base font-semibold text-white active:scale-[0.99] transition disabled:opacity-60"
          >
            Sign in with email
          </button>
        </form>
      )}

      <p className="text-xs text-stone-500 text-center">
        Invitation only — no public sign-up. Forgot your password? Ask a family admin.
      </p>
    </div>
  );
}
