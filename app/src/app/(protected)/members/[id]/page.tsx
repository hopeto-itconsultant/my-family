import { notFound, redirect } from 'next/navigation';
import { requireProfile, getBranches, getDirectory } from '@/lib/session';
import { EditMemberForm } from './edit-member-form';

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
  const people = await getDirectory();
  const member = people.find((p) => p.id === id);
  if (!member) notFound();
  const branches = await getBranches();

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-1">Edit member</h1>
      <p className="text-sm text-stone-500 mb-4">{member.full_name}</p>
      <EditMemberForm member={member} branches={branches} />
    </div>
  );
}
