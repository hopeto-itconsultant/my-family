/** Shown while the events server render is in flight, before the shell swaps in. */
export default function Loading() {
  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-5 animate-pulse" aria-hidden>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-44 rounded bg-stone-200" />
          <div className="h-4 w-56 rounded bg-stone-200" />
        </div>
        <div className="h-9 w-16 rounded-full bg-stone-200" />
      </div>
      <div className="h-10 w-[220px] rounded-xl bg-stone-200" />
      <div className="h-24 rounded-2xl bg-stone-200" />
      <div className="h-24 rounded-2xl bg-stone-200" />
      <div className="h-24 rounded-2xl bg-stone-200" />
    </div>
  );
}
