import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile, getMyNotifications } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/types';

const TABS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/directory', label: 'Family', icon: '👪' },
  { href: '/events', label: 'Events', icon: '🎂' },
  { href: '/fund', label: 'Mission Fund', icon: '💛' },
  { href: '/reports', label: 'Reports', icon: '📊' },
  { href: '/home', label: 'Me', icon: '🙂' },
];

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const unread = await getMyNotifications(5);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-teal-800 text-white px-4 py-3 flex items-center justify-between shadow">
        <Link href="/" className="font-bold tracking-tight flex items-center gap-2">
          <span aria-hidden>🏡</span> Our Family Home
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/notifications" aria-label={`Reminders${unread.length ? `, ${unread.length} new` : ''}`}
            className="relative h-9 w-9 grid place-items-center rounded-full bg-white/15 text-lg">
            🔔
            {unread.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-teal-950 text-[10px] font-bold grid place-items-center">
                {unread.length > 9 ? '9+' : unread.length}
              </span>
            )}
          </Link>
          <span className="text-xs rounded-full bg-white/15 px-3 py-1">
            {profile.full_name.split(' ')[0]} · {ROLE_LABELS[profile.role]}
          </span>
        </div>
      </header>

      <main className="flex-1 pb-24">{children}</main>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-stone-200 grid grid-cols-6 pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-stone-600 active:text-teal-700"
          >
            <span className="text-xl leading-none" aria-hidden>{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
