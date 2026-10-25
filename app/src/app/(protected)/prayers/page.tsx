import { requireProfile, getDirectory } from '@/lib/session';
import { getPrayers, getAchievements } from '@/app/actions/prayers';
import type { Achievement, PrayerRequest, ProfileWithBranch } from '@/lib/types';
import { PrayerSheet, AnswerPrayerButton } from './prayer-sheets';
import { AchievementSheet } from './achievement-sheet';

export const metadata = { title: 'Prayers & Achievements · Our Family Home' };

const KIND_ICON: Record<string, string> = {
  education: '🎓', career: '💼', faith: '🕊️', health: '❤️',
  service: '🤝', sport: '🏅', other: '✨',
};

function fmtDate(iso: string): string {
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

function nameOf(directory: ProfileWithBranch[], id: string | null): string {
  if (!id) return '';
  return directory.find((p) => p.id === id)?.full_name ?? 'A relative';
}

export default async function PrayersPage() {
  const profile = await requireProfile();
  const [directory, prayers, achievements] = await Promise.all([
    getDirectory(), getPrayers(), getAchievements(),
  ]);

  const active = prayers.filter((p) => p.status === 'active');
  const answered = prayers.filter((p) => p.status === 'answered');
  const people = directory.map((p) => ({ id: p.id, name: p.full_name }));

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold">🙏 Prayers & 🌟 Achievements</h1>

      <div className="grid grid-cols-2 gap-3">
        <PrayerSheet />
        <AchievementSheet people={people} selfId={profile.id} />
      </div>

      {/* Active prayer requests */}
      <section className="space-y-2">
        <h2 className="font-semibold text-stone-800">Being prayed for ({active.length})</h2>
        {active.length === 0 && (
          <p className="text-sm text-stone-500 rounded-xl bg-white ring-1 ring-stone-200 p-4">
            No open requests right now. Post one above — or keep a private one to yourself.
          </p>
        )}
        {active.map((p: PrayerRequest) => {
          const mine = p.member_id === profile.id;
          return (
            <article key={p.id} className="rounded-2xl bg-white ring-1 ring-stone-200 p-4 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-snug">
                  {p.is_private && <span title="Private">🔒 </span>}
                  {p.title}
                </h3>
                <span className="text-xs text-stone-500 shrink-0">{fmtDate(p.created_at)}</span>
              </div>
              <p className="text-xs text-stone-500">
                {mine ? 'You' : nameOf(directory, p.member_id)}
                {p.branch_id ? ` · ${directory.find((d) => d.id === p.member_id)?.branches?.name ?? ''}` : ''}
              </p>
              {p.detail && <p className="text-sm text-stone-700">{p.detail}</p>}
              {mine && <AnswerPrayerButton id={p.id} />}
            </article>
          );
        })}
      </section>

      {/* Answered thanks */}
      {answered.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-800">Answered — thank God 🎉 ({answered.length})</h2>
          {answered.map((p) => (
            <article key={p.id} className="rounded-2xl bg-teal-50 ring-1 ring-teal-100 p-4">
              <h3 className="font-semibold text-teal-900 line-through decoration-teal-400">{p.title}</h3>
              {p.answered_note && <p className="text-sm text-teal-800 mt-1">“{p.answered_note}”</p>}
              <p className="text-xs text-teal-600 mt-1">
                {p.member_id === profile.id ? 'You' : nameOf(directory, p.member_id)} · {fmtDate(p.updated_at)}
              </p>
            </article>
          ))}
        </section>
      )}

      {/* Achievements feed */}
      <section className="space-y-2">
        <h2 className="font-semibold text-stone-800">Family achievements</h2>
        {achievements.length === 0 && (
          <p className="text-sm text-stone-500 rounded-xl bg-white ring-1 ring-stone-200 p-4">
            Nothing celebrated yet — be the first to honour someone!
          </p>
        )}
        {achievements.map((a: Achievement) => (
          <article key={a.id} className="rounded-2xl bg-white ring-1 ring-stone-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-snug">
                {KIND_ICON[a.kind] ?? '✨'} {a.title}
              </h3>
              <span className="text-xs text-stone-500 shrink-0">{fmtDate(a.achieved_on)}</span>
            </div>
            <p className="text-xs text-stone-500">
              {nameOf(directory, a.member_id)}
              {a.member_id !== profile.id && a.created_by !== a.member_id
                ? ` · celebrated by ${nameOf(directory, a.created_by)}` : ''}
            </p>
            {a.detail && <p className="text-sm text-stone-700 mt-1">{a.detail}</p>}
          </article>
        ))}
      </section>

      <p className="text-xs text-stone-400 pt-2">
        Private prayers are visible only to you. Everything posted here is recorded in the family audit trail.
      </p>
    </div>
  );
}
