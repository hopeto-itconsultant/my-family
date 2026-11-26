import { notFound, redirect } from 'next/navigation';
import { requireProfile, getBranches, getDirectory } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingAuthUser } from '@/lib/phone-login';
import { getActivePreview } from '@/lib/view-as-session';
import { ViewAsButton } from '@/components/view-as-button';
import { EditMemberForm } from './edit-member-form';

export const metadata = { title: 'Edit member · Our Family Home' };

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  const preview = await getActivePreview();
  if (preview) redirect('/members');
  if (profile.role !== 'admin') {
    redirect('/members?error=' + encodeURIComponent('Only an admin can edit members.'));
  }
  const { id } = await params;
  const people = await getDirectory();
  const member = people.find((p) => p.id === id);
  if (!member) notFound();
  const branches = await getBranches();
  let hasLogin: boolean | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error && isMissingAuthUser(error)) hasLogin = false;
    else if (data.user) hasLogin = true;
  } catch {
    hasLogin = null;
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold mb-1">Edit member</h1>
          <p className="text-sm text-stone-500">{member.full_name}</p>
        </div>
        <ViewAsButton memberId={member.id} hasLogin={hasLogin} back={`/members/${member.id}`} />
      </div>
      <EditMemberForm member={member} branches={branches} />
    </div>
  );
}
