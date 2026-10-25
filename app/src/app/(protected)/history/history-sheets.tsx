'use client';

import { useState, useTransition } from 'react';
import { useOnline } from '@/components/pwa';
import { addHistoryEntry, uploadPhoto, addAsset, type ActionResult } from '@/app/actions/history';

type Tab = 'story' | 'photo' | 'asset';

const inputCls = 'w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5 text-sm';

export function HistorySheets({
  people,
  branches,
}: {
  people: { id: string; name: string }[];
  branches: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('story');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const online = useOnline();

  // story fields
  const [title, setTitle] = useState('');
  const [era, setEra] = useState('');
  const [story, setStory] = useState('');
  const [eventDate, setEventDate] = useState('');

  // photo fields
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [takenOn, setTakenOn] = useState('');

  // asset fields
  const [aKind, setAKind] = useState('vehicle');
  const [aName, setAName] = useState('');
  const [ownerType, setOwnerType] = useState<'member' | 'branch' | 'family'>('family');
  const [ownerId, setOwnerId] = useState('');
  const [year, setYear] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  const ready =
    (tab === 'story' && title.trim().length >= 2 && story.trim().length >= 2) ||
    (tab === 'photo' && file !== null) ||
    (tab === 'asset' && aName.trim().length >= 1);

  function submit() {
    if (!ready || isPending) return;
    setResult(null);
    startTransition(async () => {
      let res: ActionResult;
      if (tab === 'story') {
        res = await addHistoryEntry({ title, era, story, eventDate });
        if (res.ok) { setTitle(''); setEra(''); setStory(''); setEventDate(''); }
      } else if (tab === 'photo') {
        const fd = new FormData();
        if (file) fd.append('file', file);
        fd.append('caption', caption);
        fd.append('taken_on', takenOn);
        res = await uploadPhoto(fd);
        if (res.ok) { setFile(null); setCaption(''); setTakenOn(''); }
      } else {
        res = await addAsset({
          kind: aKind, name: aName, ownerType, ownerId,
          purchaseYear: year, amountRupees: value, notes,
        });
        if (res.ok) { setAName(''); setValue(''); setNotes(''); setYear(''); }
      }
      setResult(res);
      if (res.ok) setTimeout(() => setOpen(false), 900);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-20 rounded-full bg-stone-800 text-white px-5 py-3 shadow-lg active:bg-stone-900"
      >
        + Add
      </button>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Add to family records</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 text-xl px-2">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['story', 'photo', 'asset'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setResult(null); }}
                  className={`rounded-xl py-2 text-sm font-medium ring-1 ${
                    tab === t ? 'bg-teal-700 text-white ring-teal-700' : 'bg-white text-stone-600 ring-stone-300'
                  }`}
                >
                  {t === 'story' ? '📜 Story' : t === 'photo' ? '📷 Photo' : '🚗 Asset'}
                </button>
              ))}
            </div>

            {tab === 'story' && (
              <div className="space-y-3">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. The old house in Kumbakonam)" className={inputCls} maxLength={160} />
                <input value={era} onChange={(e) => setEra(e.target.value)} placeholder="Era / decade (optional)" className={inputCls} maxLength={60} />
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputCls} />
                <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={5} maxLength={5000} placeholder="Tell the story…" className={inputCls} />
              </div>
            )}

            {tab === 'photo' && (
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className={inputCls}
                />
                <p className="text-xs text-stone-500">JPG/PNG/WEBP up to 8 MB. Stored in private storage — only signed-in relatives can view.</p>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className={inputCls} maxLength={300} />
                <input type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} className={inputCls} />
              </div>
            )}

            {tab === 'asset' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {['vehicle', 'property', 'jewellery', 'electronics', 'cash', 'other'].map((k) => (
                    <button key={k} onClick={() => setAKind(k)}
                      className={`text-sm rounded-full px-3 py-1.5 ring-1 capitalize ${
                        aKind === k ? 'bg-teal-700 text-white ring-teal-700' : 'bg-white text-stone-600 ring-stone-300'
                      }`}>
                      {k}
                    </button>
                  ))}
                </div>
                <input value={aName} onChange={(e) => setAName(e.target.value)} placeholder="Name (e.g. Ambassador car TN-01-AB-1234)" className={inputCls} maxLength={160} />
                <div className="flex gap-2">
                  {(['family', 'branch', 'member'] as const).map((t) => (
                    <button key={t} onClick={() => { setOwnerType(t); setOwnerId(''); }}
                      className={`text-sm rounded-full px-3 py-1.5 ring-1 capitalize ${
                        ownerType === t ? 'bg-stone-800 text-white ring-stone-800' : 'bg-white text-stone-600 ring-stone-300'
                      }`}>
                      Own: {t}
                    </button>
                  ))}
                </div>
                {ownerType !== 'family' && (
                  <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                    <option value="">Choose {ownerType}…</option>
                    {(ownerType === 'branch' ? branches : people).map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Year bought" inputMode="numeric" className={inputCls} />
                  <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value ₹ (optional)" inputMode="decimal" className={inputCls} />
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={800} placeholder="Notes (insurance, documents kept with…) (optional)" className={inputCls} />
              </div>
            )}

            {result && !result.ok && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{result.error}</p>}
            {result?.ok && <p className="text-sm text-teal-700">Saved ✓</p>}
            <button
              onClick={submit}
              disabled={!online || !ready || isPending}
              className="w-full rounded-xl bg-teal-700 text-white py-3 font-semibold disabled:opacity-40"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
