import { requireProfile, getEvents, getMemberNames, getBranches, canManage } from '@/lib/session';
import { istToday, monthKey, parseMonthParam } from '@/lib/calendar';
import { EventsBoard } from './events-board';

export const metadata = { title: 'Events · Our Family Home' };

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const today = istToday();
  const shown = parseMonthParam(sp.month, today);
  const [events, people, branches] = await Promise.all([getEvents(), getMemberNames(), getBranches()]);

  return (
    <EventsBoard
      events={events}
      people={people}
      branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      leader={canManage(profile)}
      todayIso={today.iso}
      initialView={sp.view === 'calendar' ? 'calendar' : 'list'}
      initialMonth={monthKey(shown.year, shown.month)}
    />
  );
}
