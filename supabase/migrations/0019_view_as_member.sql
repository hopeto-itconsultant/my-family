-- ============================================================================
-- 0019 — Admin "View as member" (read-only preview)
--
-- An admin can open the app with a member's own Postgres permissions (RLS,
-- branch memberships, fund role) without learning or changing their password
-- and without replacing the admin's browser session.
--
-- How it stays faithful and read-only:
--   1. The server asks GoTrue for a magic-link token for that auth user and
--      verifies it on the server. No email is sent. The admin's cookies are
--      left alone.
--   2. This hook stamps app_metadata.impersonation = true on that GoTrue
--      session only. The claim is never taken from user_metadata (members
--      can edit that). Password sign-ins use a different session id, so they
--      are not stamped.
--   3. BEFORE INSERT/UPDATE/DELETE triggers and the storage write policies
--      reject the request when the claim is set. The app also hides write
--      controls and refuses server actions.
--
-- A directory-only profile has no auth.users row, so there is no session
-- whose RLS identity we can adopt. The app disables View as for them.
--
-- Apply with: supabase db push   (or the SQL editor). Do not skip this file:
-- without the hook change, the app refuses to enter a preview rather than
-- hold a token that can write.
--
-- Rollback: drop the triggers and impersonation_sessions, restore
-- public.custom_access_token_hook from 0007_role_claim_hook.sql, and restore
-- the storage policies from 0003 / 0015.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Preview sessions. The access token is never stored here.
--    Any GoTrue session id listed in this table stays read-only for its
--    whole life (including after the 30-minute app window), so a refresh
--    cannot turn the preview into a normal writable login.
-- ----------------------------------------------------------------------------
create table public.impersonation_sessions (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references public.profiles (id) on delete cascade,
  subject_id  uuid not null references public.profiles (id) on delete cascade,
  session_id  uuid,
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  ended_at    timestamptz,
  end_reason  text,
  constraint impersonation_sessions_end_reason_chk
    check (end_reason is null or end_reason in ('exit', 'expired', 'aborted')),
  constraint impersonation_sessions_end_pair_chk
    check ((ended_at is null) = (end_reason is null)),
  constraint impersonation_sessions_distinct_chk
    check (actor_id <> subject_id)
);

comment on table public.impersonation_sessions is
  'Admin view-as previews. session_id is the GoTrue session. Tokens are not stored. Rows are ended, never deleted, so the access-token hook can keep that session read-only.';

create unique index impersonation_sessions_session_id_key
  on public.impersonation_sessions (session_id)
  where session_id is not null;

create index impersonation_sessions_actor_id_idx
  on public.impersonation_sessions (actor_id);

create index impersonation_sessions_subject_id_idx
  on public.impersonation_sessions (subject_id);

alter table public.impersonation_sessions enable row level security;

revoke all on table public.impersonation_sessions from public, anon, authenticated;
grant select, insert, update on public.impersonation_sessions to service_role;

-- ----------------------------------------------------------------------------
-- 2) Claim check. JSON true becomes the text "true" via #>>. Never read
--    user_metadata — that object is editable by the signed-in user.
-- ----------------------------------------------------------------------------
create or replace function public.is_impersonating()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      nullif(current_setting('request.jwt.claims', true), '')::jsonb
        #>> '{app_metadata,impersonation}'
    ) = 'true',
    false
  );
$$;

comment on function public.is_impersonating() is
  'True when the current JWT was issued for an admin view-as session (app_metadata.impersonation). Not user_metadata.';

revoke all on function public.is_impersonating() from public, anon;
grant execute on function public.is_impersonating() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) Block every row write while that claim is set. Name sorts first so this
--    BEFORE trigger runs ahead of audit/guard triggers and aborts the
--    statement. SECURITY DEFINER so the check runs even though authenticated
--    cannot select impersonation_sessions; it only reads the JWT.
-- ----------------------------------------------------------------------------
create or replace function public.reject_view_as_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_impersonating() then
    raise exception 'Read-only while an admin is viewing as this member'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.reject_view_as_write() from public, anon;
-- authenticated must be able to execute a trigger function that fires for them.
grant execute on function public.reject_view_as_write() to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'branches', 'audit_log', 'family_relations', 'events',
    'prayer_requests', 'achievements', 'history_entries', 'photos', 'family_assets',
    'contributions', 'expenses', 'statement_batches', 'bank_statement_rows',
    'notifications', 'org_units', 'unit_memberships'
  ]
  loop
    execute format('drop trigger if exists "00_view_as_readonly" on public.%I', t);
    execute format(
      'create trigger "00_view_as_readonly" before insert or update or delete on public.%I
         for each row execute function public.reject_view_as_write()',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Storage writes (photos, receipts). SELECT stays so a treasurer preview
--    can still open receipt links. Copies the existing owner/role checks and
--    adds the read-only claim.
-- ----------------------------------------------------------------------------
drop policy if exists "photos upload own folder" on storage.objects;
create policy "photos upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'family-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not public.is_impersonating()
  );

drop policy if exists "photos delete owner or leader" on storage.objects;
create policy "photos delete owner or leader" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'family-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_steward()
    )
    and not public.is_impersonating()
  );

drop policy if exists "receipts treasurer manage" on storage.objects;
create policy "receipts treasurer read" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.jwt_role() in ('treasurer', 'admin'));

create policy "receipts treasurer insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.jwt_role() in ('treasurer', 'admin')
    and not public.is_impersonating()
  );

create policy "receipts treasurer update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and public.jwt_role() in ('treasurer', 'admin')
    and not public.is_impersonating()
  )
  with check (
    bucket_id = 'receipts'
    and public.jwt_role() in ('treasurer', 'admin')
    and not public.is_impersonating()
  );

create policy "receipts treasurer delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and public.jwt_role() in ('treasurer', 'admin')
    and not public.is_impersonating()
  );

-- ----------------------------------------------------------------------------
-- 5) Access-token hook. Role claim behavior is unchanged (0007). The
--    impersonation stamp is isolated so a failure there cannot block sign-in.
--    Only a session id present in impersonation_sessions is stamped — never
--    user_metadata, and never a password sign-in's session.
-- ----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  user_role public.family_role;
  sid uuid;
  stamp boolean := false;
begin
  select role into user_role
    from public.profiles
   where id = (event->>'user_id')::uuid;

  claims := event->'claims';
  if claims is null then
    claims := '{}'::jsonb;
  end if;
  if jsonb_typeof(claims->'app_metadata') is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;
  claims := jsonb_set(
    claims,
    '{app_metadata,role}',
    to_jsonb(coalesce(user_role, 'member'::public.family_role)::text)
  );

  begin
    sid := nullif(claims->>'session_id', '')::uuid;
    if sid is not null and exists (
      select 1
        from public.impersonation_sessions s
       where s.session_id = sid
    ) then
      stamp := true;
    end if;
    if stamp then
      claims := jsonb_set(claims, '{app_metadata,impersonation}', 'true'::jsonb);
    else
      claims := claims #- '{app_metadata,impersonation}';
    end if;
  exception when others then
    -- Never fail a normal sign-in because the preview table is unavailable.
    null;
  end;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
