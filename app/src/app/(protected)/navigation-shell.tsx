'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface TabDef {
  href: string;
  label: string;
  icon: string;
}

/**
 * Client part of the protected shell: bottom tab bar with an active-tab
 * highlight (instant feedback on tap) and default Next.js prefetching for
 * fast page loads. Heavy/less-visited tabs opt out via `noPrefetch`.
 */
export function NavigationShell({
  tabs,
  children,
}: {
  tabs: TabDef[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <>
      <main className="flex-1 pb-24">{children}</main>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-stone-200 grid grid-cols-6 pb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((t) => {
          const active =
            t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              scroll={false}
              className={
                'flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors active:text-teal-700 ' +
                (active ? 'text-teal-800 font-bold' : 'text-stone-600 font-medium')
              }
              aria-current={active ? 'page' : undefined}
            >
              <span className="text-xl leading-none" aria-hidden>{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
