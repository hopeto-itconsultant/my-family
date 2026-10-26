import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavigationShell } from './navigation-shell';
import { requireProfile, getMyNotifications } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/types';

const TABS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/directory', label: 'Family', icon: '👪' },
  { href: '/events', label: 'Events', icon: '🎂' },
  { href: '/fund', label: 'Mission Fund', icon: '💛' },
  { href: '/reports', label: 'Reports', icon: '📊' },
  { href: "/units", label: "Groups", icon: "🧩" },
  { href: "/home", label: "Me", icon: "🙂" },
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

      <NavigationShell tabs={TABS}>{children}</NavigationShell>
    </div>
  );
}
