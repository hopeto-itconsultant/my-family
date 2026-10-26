import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/session';
import { getBranches } from '@/lib/session';
import { NewMemberForm } from './new-member-form';

export const metadata = { title: 'Add member · Our Family Home' };

export default async function NewMemberPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== 'admin') {
    redirect('/members?error=' + encodeURIComponent('Only an admin can add members.'));
  }
  await searchParams; // errors are surfaced inside the form via action state
  const branches = await getBranches();

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-1">Add family member</h1>
      <p className="text-sm text-stone-500 mb-4">
        Creates a login for a relative. They sign in with their mobile number.
      </p>
      <NewMemberForm branches={branches} />
    </div>
  );
}
