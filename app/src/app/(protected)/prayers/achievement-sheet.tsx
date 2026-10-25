'use client';

import { useMemo, useState, useTransition } from 'react';
import { useOnline } from '@/components/pwa';
import { addAchievement, type ActionResult } from '@/app/actions/prayers';

interface PersonOption {
  id: string;
  name: string;
}

const KINDS = [
  { value: 'education', label: '🎓 Education' },
  { value: 'career', label: '💼 Career' },
  { value: 'faith', label: '🕊️ Faith' },
  { value: 'health', label: '❤️ Health' },
  { value: 'service', label: '🤝 Service' },
  { value: 'sport', label: '🏅 Sport' },
  { value: 'other', label: '✨ Other' },
];

/** Bottom-sheet: celebrate a relative's achievement. */
export function AchievementSheet({ people, selfId }: { people: PersonOption[]; selfId: string }) {
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(selfId);
  const [kind, setKind] = useState('education');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [achievedOn, setAchievedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const online = useOnline();

  const sortedPeople = useMemo(
    () => [...people].sort((x, y) => x.name.localeCompare(y.name)),
    [people],
  );
  const canSubmit = memberId !== '' && title.trim().length >= 2 && achievedOn !== '' && !isPending;

  function submit() {
    if (!canSubmit) return;
    setResult(null);
    startTransition(async () => {
      const res = await addAchievement({ memberId, kind, title, detail, achievedOn });
      setResult(res);
      if (res.ok) {
        setTitle('');
        setDetail('');
        setTimeout(() => setOpen(false), 900);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-amber-500 text-white py-3 font-semibold active:bg-amber-600"
      >
        🌟 Celebrate an achievement
      </button>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">New achievement</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 text-xl px-2">✕</button>
            </div>
            <label className="block text-sm text-stone-600 space-y-1">
              Who?
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5 bg-white"
              >
                {sortedPeople.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  onClick={() => setKind(k.value)}
                  className={`text-sm rounded-full px-3 py-1.5 ring-1 ${
                    kind === k.value
                      ? 'bg-teal-700 text-white ring-teal-700'
                      : 'bg-white text-stone-700 ring-stone-300'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What happened? (e.g. Passed board exams)"
              maxLength={160}
              className="w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5"
            />
            <input
              type="date"
              value={achievedOn}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setAchievedOn(e.target.value)}
              className="w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5"
            />
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="More details (optional)"
              rows={2}
              maxLength={800}
              className="w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5"
            />
            {result && !result.ok && (
              <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{result.error}</p>
            )}
            {result?.ok && <p className="text-sm text-teal-700">Celebrated 🎉</p>}
            <button
              onClick={submit}
              disabled={!online || !canSubmit}
              className="w-full rounded-xl bg-amber-500 text-white py-3 font-semibold disabled:opacity-40"
            >
              {isPending ? 'Saving…' : 'Add achievement'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
