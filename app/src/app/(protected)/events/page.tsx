import Link from 'next/link';
import { requireProfile, getUpcomingEvents, getDirectory, canManage } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { FamilyEvent } from '@/lib/types';
import { AddEventSheet } from './add-event';

export const metadata = { title: 'Events · Our Family Home' };

const KIND_META: Record<FamilyEvent['kind'], { icon: string; label: string }> = {
  birthday: { icon: '🎂', label: 'Birthday' },
  anniversary: { icon: '💞', label: 'Anniversary' },
  meetup: { icon: '📅', label: 'Meetup' },
};

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

export default async function EventsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [events, people] = await Promise.all([getUpcomingEvents(60), getDirectory()]);
  const { data: branchRows } = await supabase.from('branches').select('id, name').order('order_hint');
  const branches = (branchRows ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));

  const names = new Map(people.map((p) => [p.id, p.full_name]));

  // Group by calendar month for a scannable mobile list.
  const byMonth = new Map<string, FamilyEvent[]>();
  for (const e of events) {
    const key = e.occurs_on.slice(0, 7); // YYYY-MM
    const list = byMonth.get(key) ?? [];
    list.push(e);
    byMonth.set(key, list);
  }

  const leader = canManage(profile);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Birthdays &amp; meetups</h1>
          <p className="text-sm text-stone-500 mt-1">
            {events.length === 0
              ? 'Nothing in the next 60 days.'
              : `${events.length} event${events.length > 1 ? 's' : ''} in the next 60 days`}
          </p>
        </div>
        <AddEventSheet
          people={people.map((p) => ({ id: p.id, name: p.full_name }))}
          branches={branches}
        />
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-6 text-center space-y-3">
          <div className="text-3xl" aria-hidden>🗓️</div>
          <p className="text-sm text-stone-600">
            Coordinators add anniversaries and meetups here. You can add your own
            birthday — recurring dates roll forward automatically each year.
          </p>
          <Link href="/directory" className="inline-block text-sm font-medium text-teal-700 underline">
            Find relatives in the directory →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {[...byMonth.entries()].map(([monthKey, list]) => (
            <section key={monthKey}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                {new Date(monthKey + '-01T00:00:00').toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'Asia/Kolkata',
                })}
              </h2>
              <ul className="space-y-2">
                {list.map((e) => {
                  const d = daysUntil(e.occurs_on);
                  const meta = KIND_META[e.kind];
                  const who = e.member_id ? names.get(e.member_id) : null;
                  return (
                    <li key={e.id} className="rounded-xl bg-white ring-1 ring-stone-200 p-3 flex items-start gap-3">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 ring-1 ring-amber-200 flex items-center justify-center text-lg">
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{e.title}</div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {formatDate(e.occurs_on)}
                          {who ? ` · for ${who}` : ''}
                          {e.venue ? ` · ${e.venue}` : ''}
                        </div>
                        {e.notes && <div className="text-xs text-stone-500 mt-1 italic">{e.notes}</div>}
                      </div>
                      <span
                        className={
                          'shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 ' +
                          (d === 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : d <= 7
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-stone-100 text-stone-600')
                        }
                      >
                        {d === 0 ? 'Today 🎉' : d === 1 ? 'Tomorrow' : `in ${d} days`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-stone-500">
        {leader
          ? 'As treasurer you can add and remove any event. Every change is visible to the whole family.'
          : 'Members may add their own birthday. Ask the treasurer to add anniversaries or meetups.'}
      </p>
    </div>
  );
}
