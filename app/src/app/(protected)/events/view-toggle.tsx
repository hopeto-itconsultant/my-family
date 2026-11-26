import Link from 'next/link';

/** List / Calendar switch. The choice lives in `?view=calendar`. */
export function EventsViewToggle({
  view,
  calendarHref,
  listHref = '/events',
}: {
  view: 'list' | 'calendar';
  calendarHref: string;
  listHref?: string;
}) {
  const tab =
    'rounded-lg py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700';
  return (
    <div
      role="tablist"
      aria-label="Events layout"
      className="grid grid-cols-2 gap-1 rounded-xl bg-stone-200/80 p-1 text-sm font-medium w-full max-w-[220px]"
    >
      <Link
        href={listHref}
        scroll={false}
        role="tab"
        aria-selected={view === 'list'}
        className={tab + (view === 'list' ? ' bg-white shadow text-teal-800' : ' text-stone-600')}
      >
        List
      </Link>
      <Link
        href={calendarHref}
        scroll={false}
        role="tab"
        aria-selected={view === 'calendar'}
        className={tab + (view === 'calendar' ? ' bg-white shadow text-teal-800' : ' text-stone-600')}
      >
        Calendar
      </Link>
    </div>
  );
}
