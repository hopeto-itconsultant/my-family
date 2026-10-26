import Link from 'next/link';
import { requireProfile, getMyNotifications } from '@/lib/session';
import { NotificationList } from './notifications/notification-list';

export default async function HomePage() {
  const profile = await requireProfile();
  const reminders = await getMyNotifications(3);

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

      {reminders.length > 0 && (
        <section aria-label="Reminders" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">🔔 For you</h2>
            <Link href="/notifications" className="text-xs text-teal-700 underline">All reminders</Link>
          </div>
          <NotificationList items={reminders} />
        </section>
      )}

      <InstallHint />

      <section aria-label="Features" className="grid grid-cols-2 gap-3">
        <FeatureCard href="/directory" icon="👪" title="Family directory" desc="All relatives & branches" ready />
        <FeatureCard href="/tree" icon="🌳" title="Family tree" desc="Generations & relations" ready />
        <FeatureCard href="/fund" icon="💛" title="Mission Fund" desc="Contributions, balance, audit" ready />
        <FeatureCard href="/events" icon="🎂" title="Birthdays & meetups" desc="Next 60 days" ready />
        <FeatureCard href="/prayers" icon="🙏" title="Prayers & achievements" desc="Share & celebrate" ready />
        <FeatureCard href="/history" icon="📜" title="History & photos" desc="Stories, albums, assets" ready />
        <FeatureCard href="/reports" icon="📊" title="Fund reports" desc="Monthly statement · print/PDF" ready />
        <FeatureCard href="/fund" icon="💛" title="Mission Fund" desc="Treasurer-recorded entries, family-visible" ready />
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

function InstallHint() {
  return (
    <details className="rounded-2xl bg-teal-50 ring-1 ring-teal-200 p-4 text-sm">
      <summary className="font-semibold text-teal-900 cursor-pointer">📲 Install this app on your phone</summary>
      <ol className="mt-2 space-y-1 text-teal-900/90 list-decimal list-inside">
        <li>Open this site in Chrome (Android) or Safari (iPhone).</li>
        <li>Android: menu ⋮ → “Add to Home screen” (or tap Install when prompted).</li>
        <li>iPhone: Share → “Add to Home Screen”.</li>
        <li>It opens full-screen like a normal app and works offline for browsing.</li>
      </ol>
    </details>
  );
}
