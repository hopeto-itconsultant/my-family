import { requireProfile } from '@/lib/session';

export const metadata = { title: 'Reconciliation · Our Family Home' };

/**
 * Bank reconciliation was retired by family decision (migration 0008):
 * Mission Fund entries are manual-only, recorded solely by the treasurer.
 * The old screens stay reachable but show this notice; DB access to the
 * statement functions has been revoked for all client roles.
 */
export default async function ReconcilePage() {
  await requireProfile();
  return (
    <div className="px-4 py-10 max-w-lg mx-auto text-center space-y-4">
      <p className="text-4xl" aria-hidden>🚫</p>
      <h1 className="text-xl font-bold">Bank reconciliation retired</h1>
      <p className="text-sm text-stone-600">
        As per the family decision, all Mission Fund entries are recorded manually by the treasurer
        only — no bank-statement import or matching is used. Contribution and expense records remain
        fully visible to everyone on the <a href="/fund" className="underline text-teal-700">Mission Fund page</a>.
      </p>
    </div>
  );
}
