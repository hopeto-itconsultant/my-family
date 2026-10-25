import Link from 'next/link';
import { requireProfile } from '@/lib/session';

export default async function HomePage() {
  const profile = await requireProfile();

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      <section className="rounded-2xl bg-white ring-1 ring-stone-200 p-5 shadow-sm">
        <h1 className="text-xl font-bold">
          Vanakkam, {profile.full_name.split(' ')[0]} 🙏
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Welcome to our family&apos;s private home. Everything here is visible
          only to invited relatives.
        </p>
      </section>

      <section aria-label="Features" className="grid grid-cols-2 gap-3">
        <FeatureCard href="/directory" icon="👪" title="Family directory" desc="All relatives & branches" ready />
        <FeatureCard href="/tree" icon="🌳" title="Family tree" desc="Generations & relations" ready />
        <FeatureCard href="/fund" icon="💛" title="Mission Fund" desc="Contributions, balance, audit" ready />
        <FeatureCard href="/events" icon="🎂" title="Birthdays & meetups" desc="Next 60 days" ready />
        <FeatureCard href="/prayers" icon="🙏" title="Prayers & achievements" desc="Coming in Phase 4" />
        <FeatureCard href="/history" icon="📜" title="History & photos" desc="Coming in Phase 5" />
        <FeatureCard href="/home" icon="🙂" title="My profile" desc="Name, phone, role" ready />
      </section>
    </div>
  );
}

function FeatureCard({
  href, icon, title, desc, ready = false,
}: { href: string; icon: string; title: string; desc: string; ready?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-2xl p-4 ring-1 shadow-sm transition active:scale-[0.98] ${
        ready ? 'bg-white ring-stone-200' : 'bg-stone-100 ring-stone-200 opacity-70'
      }`}
    >
      <div className="text-2xl mb-2" aria-hidden>{icon}</div>
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-stone-500 mt-0.5">{desc}</div>
      {!ready && (
        <span className="inline-block mt-2 text-[10px] font-medium bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
          Soon
        </span>
      )}
    </Link>
  );
}
