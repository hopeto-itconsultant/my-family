import Link from 'next/link';
import { requireProfile } from '@/lib/session';
import { updateOwnProfile, signOut } from '@/app/actions/auth';
import { ROLE_LABELS } from '@/lib/types';

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold">My profile</h1>

      {sp.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-800 text-sm px-4 py-3 ring-1 ring-emerald-200">
          Profile updated ✅
        </p>
      )}
      {sp.error && (
        <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 ring-1 ring-red-200">
          {sp.error}
        </p>
      )}

      <section className="rounded-2xl bg-white ring-1 ring-stone-200 p-4 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-lg font-bold">
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-semibold">{profile.full_name}</div>
          <div className="text-xs text-stone-500">
            Role: <span className="font-medium">{ROLE_LABELS[profile.role]}</span>
            {' · '}branch assignment is done by an admin
          </div>
        </div>
      </section>

      <form
        action={updateOwnProfile}
        className="rounded-2xl bg-white ring-1 ring-stone-200 p-4 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="full_name">
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            defaultValue={profile.full_name}
            required
            className="w-full rounded-xl border border-stone-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="phone">
            Phone (shared with family only)
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={profile.phone ?? ''}
            className="w-full rounded-xl border border-stone-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="+91 …"
          />
        </div>
        <button className="w-full rounded-xl bg-teal-700 py-3 font-semibold text-white active:scale-[0.99] transition">
          Save changes
        </button>
      </form>

      <div className="space-y-2">
        <Link
          href="/fund"
          className="block rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 font-medium text-amber-900"
        >
          💛 Mission Fund dashboard
        </Link>
        <form action={signOut}>
          <button className="w-full rounded-xl bg-stone-100 ring-1 ring-stone-200 py-3 font-medium text-stone-700">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
