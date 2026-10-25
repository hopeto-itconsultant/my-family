'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { markNotificationRead } from '@/app/actions/notifications';
import type { AppNotification } from '@/lib/session';

const KIND_ICON: Record<AppNotification['kind'], string> = {
  event: '🎂',
  fund: '💛',
  system: '📣',
};

export function NotificationList({ items }: { items: AppNotification[] }) {
  const [isPending, start] = useTransition();

  return (
    <ul className="space-y-2">
      {items.map((n) => {
        const inner = (
          <>
            <span className="text-lg shrink-0" aria-hidden>{KIND_ICON[n.kind]}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-snug">{n.title}</span>
              {n.body && (
                <span className="block text-xs text-stone-500 line-clamp-2 mt-0.5">{n.body}</span>
              )}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                start(async () => { await markNotificationRead(n.id); });
              }}
              disabled={isPending}
              aria-label="Dismiss reminder"
              className="shrink-0 h-7 w-7 rounded-full bg-stone-100 text-stone-500 text-xs font-bold hover:bg-stone-200"
            >
              ✕
            </button>
          </>
        );
        return n.link ? (
          <li key={n.id}>
            <Link
              href={n.link}
              className="flex items-start gap-3 rounded-xl bg-white ring-1 ring-stone-200 p-3 active:scale-[0.99]"
            >
              {inner}
            </Link>
          </li>
        ) : (
          <li key={n.id} className="flex items-start gap-3 rounded-xl bg-white ring-1 ring-stone-200 p-3">
            {inner}
          </li>
        );
      })}
    </ul>
  );
}
