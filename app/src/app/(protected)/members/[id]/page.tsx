import { notFound, redirect } from 'next/navigation';
import { requireProfile, getBranches, getDirectory } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { EditMemberForm } from './edit-member-form';

/** True only when Auth confirms this profile has no login. Any other failure
 *  keeps the reset form, which is the safe default for existing accounts. */
async function directoryMemberNeedsLogin(id: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (data?.user) return false;
    if (!error) return true;
    const status = 'status' in error ? Number(error.status) : 0;
    return status === 404 || /not found/i.test(error.message);
  } catch {
    return false;
  }
}

export const metadata = { title: 'Edit member · Our Family Home' };

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== 'admin') {
    redirect('/members?error=' + encodeURIComponent('Only an admin can edit members.'));
  }
  const { id } = await params;
  const [people, branches, needsLogin] = await Promise.all([
    getDirectory(),
    getBranches(),
    directoryMemberNeedsLogin(id),
  ]);
  const member = people.find((p) => p.id === id);
  if (!member) notFound();

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-1">Edit member</h1>
      <p className="text-sm text-stone-500 mb-4">{member.full_name}</p>
      <EditMemberForm member={member} branches={branches} needsLogin={needsLogin} />
    </div>
  );
}
