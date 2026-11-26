# Our Family Home — Operations & Onboarding (Phase 9)

## 1. One-time Supabase setup
1. Create a project at supabase.com (Free tier is fine for ≤150 members).
2. SQL Editor → run migrations **in order**: `0001_init.sql` … `0018_phone_login_lookup.sql`
   (or `supabase db push` with the CLI).
3. Auth → Providers: keep Email enabled (it backs phone accounts). **Disable public
   sign-up**. Members log in with their registered **mobile number**. Sign-in
   (`0018_phone_login_lookup.sql`) resolves that number to `auth.users.email` on
   the server with the service-role key — a real address or `OFH-<phone>@phone.invalid`.
   Create accounts from **Members → Add member** (or a roster import). Both call
   `auth.admin.createUser`, which writes the email identity GoTrue needs.
   A raw SQL insert is only a break-glass repair. It must use empty strings for
   GoTrue's token columns and insert an `auth.identities` row (`provider` `email`,
   `provider_id` = the user uuid). Do not insert `profiles.phone_normalized`; it is
   generated, and `handle_new_user` copies `phone` from `raw_user_meta_data`:
   ```sql
   with created as (
     insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token
     ) values (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'OFH-919876543210@phone.invalid', crypt('<initial password>', gen_salt('bf')),
       now(),
       '{"provider":"email","providers":["email"],"role":"member"}',
       jsonb_build_object('full_name','<Name>','phone','919876543210'),
       now(), now(),
       '', '', '', '', '', '', '', ''
     )
     returning id, email
   )
   insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
   select gen_random_uuid(), id,
          jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
          'email', id::text, now(), now()
     from created;
   ```
   Both login modes (mobile + email) work side by side on `/login`.
4. JWT role claim: add an *After Sign-In* hook (or custom claims setting) that copies
   `profiles.role` into `app_metadata.role`, so RLS `jwt_role()` works for treasurer/admin
   policies. Until then, verification actions rely on server-side role checks.
5. Scheduler (reminders + birthday roll-forward), pick one:
   - pg_cron (Database → Extensions → cron):
     `select cron.schedule('roll-events','0 4 * * *','select public.roll_forward_events()');`
     `select cron.schedule('reminders','1 5 * * *','select public.generate_reminders();');`
   - or a Vercel Cron / GitHub Action daily hit to a service-role Edge Function calling both.
6. Env vars (Project Settings → API): copy URL + anon key into the app's `.env.local`.
   Put the service-role key only in server env (`SUPABASE_SERVICE_ROLE_KEY`). Phone
   sign-in and member creation both need it; never prefix it `NEXT_PUBLIC_`.

## 2. Deploy (Vercel)
- Import the GitHub repo, root directory `app/`.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` as env vars.
- Deploy → HTTPS is mandatory for PWA install. Add your domain (e.g. `family.example.com`).

## 3. Inviting 50–150 relatives (suggested flow)
1. Admin signs in first (auto-created as **Admin** by migration trigger).
2. Assign branches: `update public.profiles set branch_id='<uuid>' where id='<user uuid>';`
   (branch UI arrives with admin tools; branch names are pre-seeded).
3. Promote treasurers/coordinators: `update public.profiles set role='treasurer' where id=…;`
   — every change lands in the append-only `audit_log`.
4. Share the printed card: “Open <domain> → enter your mobile number + password →
   Add to Home Screen”. First-time users receive their initial password from the admin
   (in person or by WhatsApp — never collect it back). For email-invited members the
   original flow still applies; send invites in batches of ~25 (rate limits).

## 4. Treasurer SOP (Mission Fund)
- Daily/weekly: open Mission Fund → verify each pending payment against bank statement,
  capture the UPI/bank reference. **Never mark cash as verified without a receipt.**
- Month-end: Reconcile tab → import bank CSV → match rows → any unmatched row must get an
  explanation label before the month can be closed.
- Reports tab → generate monthly statement → print/PDF to the family group.
- Corrections: always via *Reverse* (creates a new negative audit trail entry) — never edit
  a verified row directly.

## 5. Security checklist (verify before go-live)
- [ ] All 18 migrations applied (`0001_init.sql` through `0018_phone_login_lookup.sql`); `revoke` statements ran without error.
- [ ] Public sign-up disabled; only registered mobiles/invited emails can create sessions.
- [ ] Migration `0018_phone_login_lookup.sql` applied. It drops `shadow_email_for_phone`
      and revokes anon execute on `normalize_phone` (including a hotfix grant, if one
      was applied). Phone sign-in tested for a real-email account and a
      `@phone.invalid` account. Duplicate-phone registration rejected by the unique index.
- [ ] Service-role key exists ONLY in server env (never in git, never NEXT_PUBLIC_*).
- [ ] Spot-check RLS: signed-out request to `/directory` redirects; member cannot UPDATE
      contributions of others (test with two accounts).
- [ ] Audit log grows on profile edits and all fund transitions.
- [ ] Backups: enable Supabase daily PITR or weekly `pg_dump` export.
