import { requireProfile } from '@/lib/session';
import { isSupabaseConfigured } from '@/lib/env';

export default async function FundPage() {
  const profile = await requireProfile();
  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold">Mission Fund</h1>
      {!isSupabaseConfigured() ? (
        <p className="rounded-xl bg-white ring-1 ring-stone-200 p-4 text-sm text-stone-600">
          Connect Supabase (see <b>Setup guide</b>) to activate the fund ledger.
        </p>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5 space-y-2">
          <p className="text-sm text-stone-600">
            Signed in as <b>{profile.full_name}</b> ({profile.role}).
          </p>
          <p className="text-sm rounded-lg bg-amber-50 text-amber-900 ring-1 ring-amber-200 px-3 py-2">
            🚧 Phase 6 will port the approved Mission Fund dashboard prototype
            (<code>mission-fund-prototype/</code>) onto these tables with full
            RLS: contributions lifecycle, treasurer verification, audit log and
            verified-balance views. Until then, no money records exist and none
            are simulated here — unverified payments must never appear as
            received.
          </p>
          <ul className="text-xs text-stone-500 list-disc pl-5 pt-1">
            <li>Balance rule: only status = verified counts.</li>
            <li>Only treasurer/admin can verify; every change is audited.</li>
            <li>Receipts live in private Storage with signed URLs.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
