'use server';

import { redirect } from 'next/navigation';
import { startViewAs } from '@/lib/view-as-session';
import { safeNextPath } from '@/lib/view-as-policy';

/** Admin-only. Opens a read-only preview and lands on Home as that member. */
export async function beginViewAs(formData: FormData) {
  const memberId = String(formData.get('member_id') ?? '');
  const back = safeNextPath(String(formData.get('back') ?? '/members'));
  const result = await startViewAs(memberId);
  if (!result.ok) {
    const url = new URL(back, 'http://local');
    url.searchParams.set('error', result.error);
    redirect(`${url.pathname}${url.search}`);
  }
  redirect('/');
}
