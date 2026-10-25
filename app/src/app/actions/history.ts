'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { parseRupeesToPaise } from '@/lib/money';
import type { FamilyAsset, HistoryEntry, PhotoMeta } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
export async function getHistory(): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('history_entries')
    .select('id, title, era, story, event_date, created_by, created_at')
    .order('event_date', { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return data as HistoryEntry[];
}

export async function addHistoryEntry(input: {
  title: string;
  era: string;
  story: string;
  eventDate: string; // '' allowed → undated
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (input.title.trim().length < 2) return { ok: false, error: 'Give the story a title.' };
  if (input.story.trim().length < 2) return { ok: false, error: 'Write the story itself :)' };

  const supabase = await createClient();
  const { error } = await supabase.from('history_entries').insert({
    title: input.title.trim(),
    era: input.era.trim() || null,
    story: input.story.trim(),
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(input.eventDate) ? input.eventDate : null,
    created_by: profile.id,
  });
  if (error) return { ok: false, error: 'Could not save the entry.' };
  revalidatePath('/history');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Photos — private bucket 'family-photos'. Bytes live under '<uid>/<uuid>.<ext>';
// metadata rows are RLS-checked, then we mint SHORT-LIVED signed URLs here on
// the server. The anon key can never read bucket bytes directly.
// ---------------------------------------------------------------------------
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export interface PhotoWithUrl extends PhotoMeta {
  url: string | null;
}

export async function getPhotosWithUrls(limit = 48): Promise<PhotoWithUrl[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, caption, taken_on, uploaded_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const paths = data.map((p) => p.storage_path);
  const { data: signed } = await supabase.storage
    .from('family-photos')
    .createSignedUrls(paths, 60 * 10); // 10 minutes — page refreshes re-mint
  const urlByPath = new Map<string, string | null>();
  signed?.forEach((s, i) => urlByPath.set(paths[i], s.error ? null : s.signedUrl));
  return (data as PhotoMeta[]).map((p) => ({ ...p, url: urlByPath.get(p.storage_path) ?? null }));
}

export async function uploadPhoto(form: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  const file = form.get('file');
  const caption = String(form.get('caption') ?? '').trim();
  const takenOn = String(form.get('taken_on') ?? '');

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a photo first.' };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: 'Please keep photos under 8 MB.' };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { ok: false, error: 'Only JPG, PNG or WEBP images are supported.' };

  const path = `${profile.id}/${crypto.randomUUID()}${ext}`;
  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from('family-photos')
    .upload(path, file, { contentType: file.type });
  if (upErr) return { ok: false, error: 'Upload failed (storage permission).' };

  const { error } = await supabase.from('photos').insert({
    storage_path: path,
    caption: caption || null,
    taken_on: /^\d{4}-\d{2}-\d{2}$/.test(takenOn) ? takenOn : null,
    uploaded_by: profile.id,
  });
  if (error) {
    // Roll back the orphaned object so metadata & bytes stay consistent.
    await supabase.storage.from('family-photos').remove([path]);
    return { ok: false, error: 'Could not record the photo.' };
  }
  revalidatePath('/history');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vehicles & assets register
// ---------------------------------------------------------------------------
export async function getAssets(): Promise<FamilyAsset[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('family_assets')
    .select(
      'id, kind, name, owner_type, owner_member_id, owner_branch_id, purchase_year, value_paise, notes, created_at, updated_at',
    )
    .order('kind')
    .order('name');
  if (error || !data) return [];
  return data as FamilyAsset[];
}

export async function addAsset(input: {
  kind: string;
  name: string;
  ownerType: 'member' | 'branch' | 'family';
  ownerId: string; // member or branch uuid ('' for family)
  purchaseYear: string;
  amountRupees: string; // converted to integer paise
  notes: string;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!input.name.trim()) return { ok: false, error: 'Name the asset.' };
  if (input.ownerType !== 'family' && !input.ownerId)
    return { ok: false, error: 'Choose the owning member or branch.' };

  let valuePaise: number | null = null;
  if (input.amountRupees.trim()) {
    valuePaise = parseRupeesToPaise(input.amountRupees);
    if (valuePaise === null) return { ok: false, error: 'Enter a valid value in ₹ (optional).' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('family_assets').insert({
    kind: input.kind,
    name: input.name.trim(),
    owner_type: input.ownerType,
    owner_member_id: input.ownerType === 'member' ? input.ownerId : null,
    owner_branch_id: input.ownerType === 'branch' ? input.ownerId : null,
    purchase_year: input.purchaseYear ? Number(input.purchaseYear) : null,
    value_paise: valuePaise,
    notes: input.notes.trim() || null,
    created_by: profile.id,
  });
  if (error) return { ok: false, error: 'Could not save the asset.' };
  revalidatePath('/history');
  return { ok: true };
}
