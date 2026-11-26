import { notFound } from 'next/navigation';
import { TreeExperience } from '../(protected)/tree/tree-experience';
import { SAMPLE_PEOPLE, SAMPLE_RELATIONS } from '@/lib/tree-sample';

export const metadata = { title: 'Family tree preview · Our Family Home' };

/** Local preview of the canvas with a fictional family. Not part of the signed-in app. */
export default async function TreeDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { edit } = await searchParams;
  const canEdit = edit !== '0';

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      <header className="shrink-0 bg-teal-800 text-white px-4 py-3 flex items-center justify-between shadow">
        <span className="font-bold tracking-tight">🏡 Our Family Home</span>
        <span className="text-xs rounded-full bg-white/15 px-3 py-1">Sample</span>
      </header>
      <p className="shrink-0 bg-amber-50 px-4 py-2 text-xs text-amber-950">
        Sample family for the tree layout. These people are not in the directory.
      </p>
      <div className="min-h-0 flex-1">
        <TreeExperience
          people={SAMPLE_PEOPLE}
          relations={SAMPLE_RELATIONS}
          canEdit={canEdit}
          localOnly
        />
      </div>
      <nav
        aria-hidden
        className="shrink-0 grid grid-cols-7 border-t border-stone-200 bg-white py-2 text-[11px] font-medium text-stone-500"
      >
        {[
          ['🏠', 'Home'],
          ['👪', 'Family'],
          ['🎂', 'Events'],
          ['💛', 'Fund'],
          ['📊', 'Reports'],
          ['🧩', 'Groups'],
          ['🙂', 'Me'],
        ].map(([icon, label]) => (
          <span key={label} className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-xl leading-none">{icon}</span>
            {label}
          </span>
        ))}
      </nav>
    </div>
  );
}
