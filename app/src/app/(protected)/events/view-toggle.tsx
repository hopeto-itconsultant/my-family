'use client';

/** List / Calendar switch. The parent updates the URL without a server navigation. */
export function EventsViewToggle({
  view,
  onChange,
}: {
  view: 'list' | 'calendar';
  onChange: (view: 'list' | 'calendar') => void;
}) {
  const tab =
    'rounded-lg py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700';
  return (
    <div
      role="tablist"
      aria-label="Events layout"
      className="grid grid-cols-2 gap-1 rounded-xl bg-stone-200/80 p-1 text-sm font-medium w-full max-w-[220px]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'list'}
        onClick={() => onChange('list')}
        className={tab + (view === 'list' ? ' bg-white shadow text-teal-800' : ' text-stone-600')}
      >
        List
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'calendar'}
        onClick={() => onChange('calendar')}
        className={tab + (view === 'calendar' ? ' bg-white shadow text-teal-800' : ' text-stone-600')}
      >
        Calendar
      </button>
    </div>
  );
}
