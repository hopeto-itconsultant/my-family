-- ============================================================================
-- 0003 — Phase 4 (prayer requests & achievements) + Phase 5 (history, photo
--        metadata, vehicles & assets). Family-wide visibility by default;
--        private prayers visible only to their author. All writes audited.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Prayer requests
-- ----------------------------------------------------------------------------
create table public.prayer_requests (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.profiles (id) on delete cascade,
  branch_id     uuid references public.branches (id) on delete set null,
  title         text not null check (char_length(title) between 2 and 160),
  detail        text check (detail is null or char_length(detail) <= 1200),
  is_private    boolean not null default false,
  status        text not null default 'active' check (status in ('active','answered')),
  answered_note text check (answered_note is null or char_length(answered_note) <= 600),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index prayer_active_idx on public.prayer_requests (status, created_at desc);

alter table public.prayer_requests enable row level security;

-- Everyone sees active public prayers and their own (any status).
create policy prayer_read on public.prayer_requests
  for select to authenticated
  using (is_private = false or member_id = auth.uid());

-- Members post under their own name only; private flag fixed at insert time
-- by the owner; nobody edits someone else's prayer except leaders (moderation).
create policy prayer_insert on public.prayer_requests
  for insert to authenticated
  with check (member_id = auth.uid());

create policy prayer_update_owner on public.prayer_requests
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid()
              -- an "answered" note can be added by the owner; privacy cannot leak outward later
              and is_private = (select p.is_private from public.prayer_requests p where p.id = prayer_requests.id));

create policy prayer_update_leader on public.prayer_requests
  for update to authenticated
  using (public.jwt_role() in ('coordinator','treasurer','admin'))
  with check (public.jwt_role() in ('coordinator','treasurer','admin'));

create policy prayer_delete_leader on public.prayer_requests
  for delete to authenticated
  using (public.jwt_role() in ('coordinator','treasurer','admin'));

-- ----------------------------------------------------------------------------
-- Achievements
-- ----------------------------------------------------------------------------
create table public.achievements (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles (id) on delete cascade,
  branch_id   uuid references public.branches (id) on delete set null,
  kind        text not null check (kind in ('education','career','faith','health','service','sport','other')),
  title       text not null check (char_length(title) between 2 and 160),
  detail      text check (detail is null or char_length(detail) <= 800),
  achieved_on date not null default current_date,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index achievements_recent_idx on public.achievements (achieved_on desc);

alter table public.achievements enable row level security;

create policy achievement_read on public.achievements
  for select to authenticated using (true);

-- Any member may celebrate any relative (family-wide feed); coordinators+ may
-- post on behalf of members who don't use the app (elders, children).
create policy achievement_insert on public.achievements
  for insert to authenticated
  with check (created_by = auth.uid());

create policy achievement_delete on public.achievements
  for delete to authenticated
  using (created_by = auth.uid() or public.jwt_role() in ('coordinator','treasurer','admin'));

-- ----------------------------------------------------------------------------
-- Family history entries (stories, milestones)
-- ----------------------------------------------------------------------------
create table public.history_entries (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 2 and 160),
  era         text check (era is null or char_length(era) <= 60),
  story       text not null check (char_length(story) between 2 and 5000),
  event_date  date,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index history_date_idx on public.history_entries (event_date desc nulls last);

alter table public.history_entries enable row level security;

create policy history_read on public.history_entries
  for select to authenticated using (true);

create policy history_insert on public.history_entries
  for insert to authenticated
  with check (created_by = auth.uid());

-- Author may edit; coordinators+ may moderate anything.
create policy history_update on public.history_entries
  for update to authenticated
  using (created_by = auth.uid() or public.jwt_role() in ('coordinator','treasurer','admin'))
  with check (created_by = auth.uid() or public.jwt_role() in ('coordinator','treasurer','admin'));

create policy history_delete on public.history_entries
  for delete to authenticated
  using (public.jwt_role() in ('coordinator','treasurer','admin'));

-- ----------------------------------------------------------------------------
-- Photo metadata rows (bytes live in the PRIVATE 'family-photos' bucket;
-- signed URLs are minted server-side after this table's RLS is checked)
-- ----------------------------------------------------------------------------
create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  storage_path text not null unique,   -- e.g. '<uploader>/<uuid>.jpg' inside family-photos
  caption     text check (caption is null or char_length(caption) <= 300),
  taken_on    date,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.photos enable row level security;

create policy photos_read on public.photos
  for select to authenticated using (true);

create policy photos_insert on public.photos
  for insert to authenticated
  with check (uploaded_by = auth.uid()
              and storage_path like auth.uid() || '/%');

create policy photos_delete on public.photos
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.jwt_role() in ('coordinator','treasurer','admin'));

-- ----------------------------------------------------------------------------
-- Vehicles & family assets
-- ----------------------------------------------------------------------------
create table public.family_assets (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('vehicle','property','jewellery','electronics','cash','other')),
  name             text not null check (char_length(name) between 1 and 160),
  owner_type       text not null default 'family' check (owner_type in ('member','branch','family')),
  owner_member_id  uuid references public.profiles (id) on delete cascade,
  owner_branch_id  uuid references public.branches (id) on delete cascade,
  purchase_year    int check (purchase_year is null or purchase_year between 1900 and 2200),
  value_paise      bigint check (value_paise is null or value_paise >= 0),
  notes            text check (notes is null or char_length(notes) <= 800),
  created_by       uuid not null references public.profiles (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint asset_owner_shape check (
    (owner_type = 'member'  and owner_member_id is not null and owner_branch_id is null) or
    (owner_type = 'branch'  and owner_branch_id is not null and owner_member_id is null) or
    (owner_type = 'family'  and owner_member_id is null     and owner_branch_id is null)
  )
);

alter table public.family_assets enable row level security;

-- Whole family may view the register (it builds trust); values stay honest.
create policy assets_read on public.family_assets
  for select to authenticated using (true);

create policy assets_insert on public.family_assets
  for insert to authenticated
  with check (created_by = auth.uid());

-- Only coordinators+ maintain the register (records matter legally).
create policy assets_update on public.family_assets
  for update to authenticated
  using (public.jwt_role() in ('coordinator','treasurer','admin'))
  with check (public.jwt_role() in ('coordinator','treasurer','admin'));

create policy assets_delete on public.family_assets
  for delete to authenticated
  using (public.jwt_role() in ('coordinator','treasurer','admin'));

-- ----------------------------------------------------------------------------
-- Audit trail for every write on these tables (append-only, via log_audit())
-- ----------------------------------------------------------------------------
create or replace function public.audit_family_content()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
begin
  -- RLS already guarantees the acting user is the author/leader, so auth.uid()
  -- is always a valid profile id here (FK on audit_log.actor_id is safe).
  if (tg_op = 'INSERT') then
    perform public.log_audit(actor,
                             tg.table_name || '.insert', tg.table_name, new.id::text, '{}'::jsonb);
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.log_audit(actor, tg.table_name || '.update', tg.table_name, new.id::text, '{}'::jsonb);
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.log_audit(actor, tg.table_name || '.delete', tg.table_name, old.id::text, '{}'::jsonb);
    return old;
  end if;
  return null;
end $$;

create trigger audit_prayers   after insert or update or delete on public.prayer_requests   for each row execute function public.audit_family_content();
create trigger audit_achieve   after insert or update or delete on public.achievements      for each row execute function public.audit_family_content();
create trigger audit_history   after insert or update or delete on public.history_entries   for each row execute function public.audit_family_content();
create trigger audit_photos    after insert or update or delete on public.photos            for each row execute function public.audit_family_content();
create trigger audit_assets    after insert or update or delete on public.family_assets     for each row execute function public.audit_family_content();

-- ----------------------------------------------------------------------------
-- Private Storage buckets (photos + receipts). Bytes are never public;
-- the app mints short-lived signed URLs after checking the metadata tables.
-- These policies assume bucket creation via the dashboard/CLI too — running
-- them here creates the buckets if they do not exist yet.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', false), ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Uploader owns their folder; all signed-in relatives may read (RLS-checked
-- server-side before signing); deletion by owner or coordinators+.
create policy "photos upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'family-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos read family" on storage.objects
  for select to authenticated
  using (bucket_id = 'family-photos');

create policy "photos delete owner or leader" on storage.objects
  for delete to authenticated
  using (bucket_id = 'family-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.jwt_role() in ('coordinator','treasurer','admin')));

-- Receipts: only treasurers/admins upload & manage (used in Phase 7).
create policy "receipts treasurer manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and public.jwt_role() in ('treasurer','admin'))
  with check (bucket_id = 'receipts' and public.jwt_role() in ('treasurer','admin'));
