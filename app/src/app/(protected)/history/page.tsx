import { requireProfile, getDirectory } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getHistory, getAssets, getPhotosWithUrls } from '@/app/actions/history';
import type { AssetKind, FamilyAsset, ProfileWithBranch } from '@/lib/types';
import { formatPaise } from '@/lib/money';
import { HistorySheets } from './history-sheets';

export const metadata = { title: 'Family Records · Our Family Home' };

const ASSET_ICON: Record<AssetKind, string> = {
  vehicle: '🚗', property: '🏠', jewellery: '💍', electronics: '📺', cash: '💵', other: '📦',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

export default async function HistoryPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [directory, history, assets, photos] = await Promise.all([
    getDirectory(),
    getHistory(),
    getAssets(),
    getPhotosWithUrls(),
  ]);
  const { data: branches } = await supabase.from('branches').select('id, name').order('name');

  const nameOf = (id: string | null) =>
    directory.find((p: ProfileWithBranch) => p.id === id)?.full_name ?? 'A relative';

  const vehicles = assets.filter((a) => a.kind === 'vehicle');
  const others = assets.filter((a) => a.kind !== 'vehicle');

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-bold">📜 Family Records</h1>
      <HistorySheets
        people={directory.map((p) => ({ id: p.id, name: p.full_name }))}
        branches={(branches ?? []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))}
      />

      {/* Timeline of stories */}
      <section className="space-y-2">
        <h2 className="font-semibold text-stone-800">Our story</h2>
        {history.length === 0 && (
          <p className="text-sm text-stone-500 rounded-xl bg-white ring-1 ring-stone-200 p-4">
            No entries yet. Tap “+ Add → Story” to record where we come from — the elders’ memories matter most.
          </p>
        )}
        {history.map((h) => (
          <article key={h.id} className="rounded-2xl bg-white ring-1 ring-stone-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{h.title}</h3>
              {h.event_date && <span className="text-xs text-stone-500 shrink-0">{fmtDate(h.event_date)}</span>}
            </div>
            {h.era && <p className="text-xs text-teal-700">{h.era}</p>}
            <p className="text-sm text-stone-700 mt-1 whitespace-pre-line">{h.story}</p>
            <p className="text-xs text-stone-400 mt-2">Recorded by {nameOf(h.created_by)}</p>
          </article>
        ))}
      </section>

      {/* Photo gallery (private storage, short-lived signed URLs) */}
      <section className="space-y-2">
        <h2 className="font-semibold text-stone-800">Photos 🔒</h2>
        {photos.length === 0 ? (
          <p className="text-sm text-stone-500 rounded-xl bg-white ring-1 ring-stone-200 p-4">
            Gallery is empty. Photos are stored privately and shown only to signed-in relatives.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <figure key={p.id} className="rounded-xl overflow-hidden bg-stone-100 aspect-square relative">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.caption ?? 'Family photo'} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-stone-400 text-xs">expired</div>
                )}
                {p.caption && (
                  <figcaption className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[10px] px-1.5 py-1 truncate">
                    {p.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* Vehicles */}
      <section className="space-y-2">
        <h2 className="font-semibold text-stone-800">Vehicles 🚗</h2>
        {vehicles.length === 0 && (
          <p className="text-sm text-stone-500 rounded-xl bg-white ring-1 ring-stone-200 p-4">No vehicles registered yet.</p>
        )}
        {vehicles.map((a) => <AssetCard key={a.id} a={a} ownerName={ownerName(a, directory, branches ?? [])} />)}
      </section>

      {/* Other assets */}
      <section className="space-y-2">
        <h2 className="font-semibold text-stone-800">Assets register</h2>
        {others.length === 0 && (
          <p className="text-sm text-stone-500 rounded-xl bg-white ring-1 ring-stone-200 p-4">
            Property, jewellery and shared items appear here. Only coordinators can edit this register.
          </p>
        )}
        {others.map((a) => <AssetCard key={a.id} a={a} ownerName={ownerName(a, directory, branches ?? [])} />)}
      </section>

      <p className="text-xs text-stone-400">
        Viewing as {profile.full_name}. Values are indicative family records, not legal valuations.
      </p>
    </div>
  );
}

function ownerName(
  a: FamilyAsset,
  directory: ProfileWithBranch[],
  branches: { id: string; name: string }[],
): string {
  if (a.owner_type === 'family') return 'Whole family';
  if (a.owner_type === 'branch')
    return branches.find((b) => b.id === a.owner_branch_id)?.name ?? 'A branch';
  return directory.find((p) => p.id === a.owner_member_id)?.full_name ?? 'A relative';
}

function AssetCard({ a, ownerName }: { a: FamilyAsset; ownerName: string }) {
  return (
    <article className="rounded-2xl bg-white ring-1 ring-stone-200 p-4 flex items-start gap-3">
      <span className="text-2xl" aria-hidden>{ASSET_ICON[a.kind]}</span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-snug">{a.name}</h3>
        <p className="text-xs text-stone-500">
          {ownerName}{a.purchase_year ? ` · since ${a.purchase_year}` : ''}
          {a.value_paise != null ? ` · ${formatPaise(Number(a.value_paise))}` : ''}
        </p>
        {a.notes && <p className="text-sm text-stone-600 mt-1">{a.notes}</p>}
      </div>
    </article>
  );
}
