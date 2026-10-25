import Link from 'next/link';
import { requireProfile, getMyNotifications } from '@/lib/session';
import { NotificationList } from './notification-list';

export default async function NotificationsPage() {
  await requireProfile();
  const items = await getMyNotifications(30);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Reminders</h1>
        <Link href="/" className="text-sm text-teal-700 underline">← Home</Link>
      </div>
      <p className="text-xs text-stone-500">
        Generated nightly by the family scheduler — birthdays & anniversaries coming up, branch
        meetups for coordinators, and a monthly Mission Fund nudge. Only you can see yours.
      </p>
      {items.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-6 text-center text-sm text-stone-500">
          🎉 Nothing needs your attention right now.
        </div>
      ) : (
        <NotificationList items={items} />
      )}
    </div>
  );
}
