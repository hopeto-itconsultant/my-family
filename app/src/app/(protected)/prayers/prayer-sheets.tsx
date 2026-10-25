'use client';

import { useState, useTransition } from 'react';
import { useOnline } from '@/components/pwa';
import { submitPrayer, markPrayerAnswered, type ActionResult } from '@/app/actions/prayers';

/** Bottom-sheet: post a prayer request (public to family, or private). */
export function PrayerSheet() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const online = useOnline();

  const canSubmit = title.trim().length >= 2 && !isPending;

  function submit() {
    if (!canSubmit) return;
    setResult(null);
    startTransition(async () => {
      const res = await submitPrayer({ title, detail, isPrivate });
      setResult(res);
      if (res.ok) {
        setTitle('');
        setDetail('');
        setIsPrivate(false);
        setTimeout(() => setOpen(false), 900);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-teal-700 text-white py-3 font-semibold active:bg-teal-800"
      >
        🙏 Post a prayer request
      </button>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Prayer request</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 text-xl px-2">✕</button>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short title (e.g. Healing for Appa)"
              maxLength={160}
              className="w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5"
            />
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Details (optional)"
              rows={3}
              maxLength={1200}
              className="w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5"
            />
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              Private — only I can see this request
            </label>
            {result && !result.ok && (
              <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{result.error}</p>
            )}
            {result?.ok && <p className="text-sm text-teal-700">Saved 🙏</p>}
            <button
              onClick={submit}
              disabled={!online || !canSubmit}
              className="w-full rounded-xl bg-teal-700 text-white py-3 font-semibold disabled:opacity-40"
            >
              {isPending ? 'Saving…' : 'Post request'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Inline "God answered!" flow for the author's own active prayers. */
export function AnswerPrayerButton({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();
  const online = useOnline();

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs rounded-full ring-1 ring-teal-200 text-teal-800 px-3 py-1 bg-teal-50"
      >
        Mark answered
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <input
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Brief testimony (optional)"
        maxLength={600}
        className="w-full rounded-xl ring-1 ring-stone-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          disabled={!online || isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await markPrayerAnswered(id, note);
              if (res.ok) setEditing(false);
            })
          }
          className="rounded-xl bg-teal-700 text-white text-sm px-4 py-2 disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="text-sm text-stone-500 px-2 py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
