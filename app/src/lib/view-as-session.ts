import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient as createJsClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createActorClient } from '@/lib/supabase/server';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';
import { isMissingAuthUser } from '@/lib/phone-login';
import {
  openPreview,
  previewSealSecret,
  revokePreviewAccessToken,
  sealPreview,
  VIEW_AS_COOKIE,
  viewAsCookieOptions,
  type PreviewSeal,
} from '@/lib/view-as-cookie';
import {
  decideViewAsStart,
  decodeJwtPayload,
  isMemberId,
  jwtExpiryMs,
  jwtSessionId,
  previewDeadline,
  previewIsCurrent,
  tokenIsReadOnlyPreview,
  viewAsWriteBlocked,
  type ViewAsEndReason,
} from '@/lib/view-as-policy';

const memoryStorage = () => {
  const jar = new Map<string, string>();
  return {
    getItem: (key: string) => jar.get(key) ?? null,
    setItem: (key: string, value: string) => {
      jar.set(key, value);
    },
    removeItem: (key: string) => {
      jar.delete(key);
    },
  };
};

function previewDataClient(): SupabaseClient {
  return createJsClient(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memoryStorage(),
    },
  });
}

export const readPreviewSeal = cache(async (): Promise<PreviewSeal | null> => {
  const secret = previewSealSecret();
  if (!secret) return null;
  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  return openPreview(raw, secret);
});

type RequestClients = {
  /** Non-null only when the preview token is current, owned by this admin, and read-only. */
  preview: PreviewSeal | null;
  client: SupabaseClient;
};

/**
 * One Supabase client for this request. During a preview it is signed in as
 * the member (RLS applies to them). Otherwise it is the admin's own cookies.
 */
export const getRequestClient = cache(async (): Promise<RequestClients> => {
  const actor = await createActorClient();
  const seal = await readPreviewSeal();
  if (!seal || !previewIsCurrent(seal.expiresAt, Date.now())) {
    return { preview: null, client: actor };
  }
  const {
    data: { user: actorUser },
  } = await actor.auth.getUser();
  if (!actorUser || actorUser.id !== seal.actorId) {
    return { preview: null, client: actor };
  }
  if (!tokenIsReadOnlyPreview(decodeJwtPayload(seal.accessToken))) {
    return { preview: null, client: actor };
  }
  const client = previewDataClient();
  const { data, error } = await client.auth.setSession({
    access_token: seal.accessToken,
    refresh_token: seal.refreshToken,
  });
  if (error || !data.user || data.user.id !== seal.subjectId) {
    return { preview: null, client: actor };
  }
  return { preview: seal, client };
});

export async function getActivePreview(): Promise<PreviewSeal | null> {
  const { preview } = await getRequestClient();
  return preview;
}

/** Why a stored seal cannot be used. Date.now stays out of the React render. */
export function unusableSealReason(seal: PreviewSeal): 'expired' | 'aborted' {
  return seal.expiresAt <= Date.now() ? 'expired' : 'aborted';
}

/** Server actions call this before any insert/update/delete/rpc write. */
export async function blockViewAsWrite(): Promise<string | null> {
  const preview = await getActivePreview();
  return viewAsWriteBlocked(preview !== null);
}

async function clearPreviewCookie(): Promise<void> {
  try {
    (await cookies()).set(VIEW_AS_COOKIE, '', viewAsCookieOptions(0));
  } catch {
    // Route handlers also clear the cookie on the response.
  }
}

/** End the preview, revoke only that GoTrue session, and append an audit row. */
export async function endPreview(reason: ViewAsEndReason): Promise<void> {
  const seal = await readPreviewSeal();
  if (seal) {
    await revokePreviewAccessToken(seal.accessToken);
    try {
      const admin = createAdminClient();
      const { data: row } = await admin
        .from('impersonation_sessions')
        .update({ ended_at: new Date().toISOString(), end_reason: reason })
        .eq('id', seal.rowId)
        .is('ended_at', null)
        .select('actor_id, subject_id')
        .maybeSingle();
      if (row) {
        await admin.rpc('log_audit', {
          p_actor: row.actor_id,
          p_action: 'impersonation.end',
          p_entity: 'profiles',
          p_entity_id: row.subject_id,
          p_detail: {
            actor_id: row.actor_id,
            subject_id: row.subject_id,
            session_row_id: seal.rowId,
            end_reason: reason,
          },
        });
      }
    } catch {
      // Still drop the cookie so the admin is not stuck in the preview.
    }
  }
  await clearPreviewCookie();
}

export type StartViewAsResult = { ok: true } | { ok: false; error: string };

/**
 * Mint a read-only GoTrue session for `memberId` and store it beside the
 * admin's own cookies. Refuses unless the hook stamped impersonation=true,
 * so we never keep a token that can write.
 */
export async function startViewAs(memberId: string): Promise<StartViewAsResult> {
  const blocked = await blockViewAsWrite();
  if (blocked) return { ok: false, error: blocked };
  if (!isMemberId(memberId)) return { ok: false, error: 'Choose a member to view as.' };

  const actor = await createActorClient();
  const {
    data: { user },
  } = await actor.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in as an admin.' };
  const { data: me } = await actor.from('profiles').select('role').eq('id', user.id).single();

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Service-role key missing on server.' };
  }

  const { data: subject } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('id', memberId)
    .maybeSingle();
  if (!subject) return { ok: false, error: 'That member was not found.' };

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(memberId);
  if (authErr && !isMissingAuthUser(authErr)) {
    return { ok: false, error: authErr.message };
  }
  const refusal = decideViewAsStart({
    actorRole: me?.role ?? null,
    actorId: user.id,
    subjectId: subject.id,
    subjectHasLogin: Boolean(authUser.user?.id) && !authErr,
    previewActive: false,
  });
  if (refusal) return { ok: false, error: refusal };
  const email = authUser.user?.email?.trim();
  if (!email) return { ok: false, error: 'That member has no sign-in email yet.' };

  const { data: inserted, error: insertErr } = await admin
    .from('impersonation_sessions')
    .insert({
      actor_id: user.id,
      subject_id: subject.id,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: insertErr?.message ?? 'Could not open the preview. Apply migration 0019_view_as_member.sql.',
    };
  }
  const rowId = inserted.id as string;

  const abort = async (token: string | null, message: string): Promise<StartViewAsResult> => {
    if (token) await revokePreviewAccessToken(token);
    await admin
      .from('impersonation_sessions')
      .update({ ended_at: new Date().toISOString(), end_reason: 'aborted' })
      .eq('id', rowId)
      .is('ended_at', null);
    return { ok: false, error: message };
  };

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data?.properties?.hashed_token || link.data.user?.id !== subject.id) {
    return abort(null, link.error?.message ?? 'Could not open a preview session for that member.');
  }

  const anon = previewDataClient();
  const verified = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session) {
    return abort(null, verified.error?.message ?? 'Could not open a preview session for that member.');
  }

  const first = verified.data.session;
  const firstPayload = decodeJwtPayload(first.access_token);
  const sessionId = jwtSessionId(firstPayload);
  if (!sessionId) {
    return abort(first.access_token, 'The preview session had no id, so it was discarded.');
  }

  const { error: attachErr } = await admin
    .from('impersonation_sessions')
    .update({ session_id: sessionId })
    .eq('id', rowId);
  if (attachErr) return abort(first.access_token, attachErr.message);

  const refreshed = await anon.auth.refreshSession({ refresh_token: first.refresh_token });
  const session = refreshed.data.session;
  if (refreshed.error || !session) {
    return abort(first.access_token, refreshed.error?.message ?? 'Could not mark the preview read-only.');
  }
  const payload = decodeJwtPayload(session.access_token);
  if (!tokenIsReadOnlyPreview(payload) || jwtSessionId(payload) !== sessionId) {
    return abort(
      session.access_token,
      'View as could not start a read-only session. Apply migration 0019_view_as_member.sql, then try again.',
    );
  }

  const expiresAt = previewDeadline(Date.now(), jwtExpiryMs(payload));
  await admin
    .from('impersonation_sessions')
    .update({ expires_at: new Date(expiresAt).toISOString() })
    .eq('id', rowId);

  const { error: auditErr } = await admin.rpc('log_audit', {
    p_actor: user.id,
    p_action: 'impersonation.start',
    p_entity: 'profiles',
    p_entity_id: subject.id,
    p_detail: {
      actor_id: user.id,
      subject_id: subject.id,
      subject_name: subject.full_name,
      session_row_id: rowId,
      expires_at: new Date(expiresAt).toISOString(),
    },
  });
  if (auditErr) return abort(session.access_token, 'Could not record the preview in the audit log.');

  const secret = previewSealSecret();
  if (!secret) return abort(session.access_token, 'Service-role key missing on server.');
  const sealed = await sealPreview(
    {
      v: 1,
      rowId,
      actorId: user.id,
      subjectId: subject.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt,
    },
    secret,
  );
  if (sealed.length > 3800) {
    return abort(session.access_token, 'The preview session was too large to store safely.');
  }
  try {
    (await cookies()).set(
      VIEW_AS_COOKIE,
      sealed,
      viewAsCookieOptions(Math.ceil((expiresAt - Date.now()) / 1000)),
    );
  } catch {
    return abort(session.access_token, 'Could not store the preview session.');
  }
  return { ok: true };
}

/** Ids of profiles that have an auth user. null when the service role is unavailable. */
export async function memberIdsWithLogin(): Promise<Set<string> | null> {
  try {
    const admin = createAdminClient();
    const ids = new Set<string>();
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return ids.size > 0 ? ids : null;
      if (!data?.users?.length) break;
      for (const u of data.users) ids.add(u.id);
      if (data.users.length < 200) break;
    }
    return ids;
  } catch {
    return null;
  }
}
