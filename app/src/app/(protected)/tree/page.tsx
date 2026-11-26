import { requireProfile, getDirectory, getRelations, canManage } from '@/lib/session';
import { getActivePreview } from '@/lib/view-as-session';
import type { TreePerson } from '@/lib/tree-layout';
import { TreeExperience } from './tree-experience';

export const metadata = { title: 'Family tree · Our Family Home' };

export default async function TreePage() {
  const profile = await requireProfile();
  const preview = await getActivePreview();
  const [directory, relations] = await Promise.all([getDirectory(), getRelations()]);
  const people: TreePerson[] = directory.map((p) => ({
    id: p.id,
    name: p.full_name,
    branch: p.branches?.name ?? null,
    nicknames: p.nicknames ?? [],
    deceased: Boolean(p.date_of_death),
  }));

  return (
    <div className="h-[calc(100dvh-7.25rem)]">
      <TreeExperience
        people={people}
        relations={relations}
        canEdit={canManage(profile) && !preview}
      />
    </div>
  );
}
