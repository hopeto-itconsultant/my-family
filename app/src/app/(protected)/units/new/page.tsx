import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireProfile } from '@/lib/session';
import { NewUnitForm } from './new-unit-form';

export const metadata = { title: 'New group · Our Family Home' };

export default async function NewUnitPage() {
  const profile = await requireProfile();
  if (profile.role !== 'admin' && profile.role !== 'treasurer') {
    redirect('/units?error=' + encodeURIComponent('Only a treasurer or admin can create groups.'));
  }
  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold">New group / division</h1>
      <p className="text-sm text-stone-500">
        Committees, fellowships, prayer groups… Creating one does not grant anyone
        access — add members explicitly on its page afterwards.
      </p>
      <NewUnitForm canCreateBranch={profile.role === 'admin'} />
      <Link href="/units" className="text-sm text-teal-700 underline">← Back to my units</Link>
    </div>
  );
}
