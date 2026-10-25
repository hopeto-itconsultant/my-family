# Our Family Home — Operations & Onboarding (Phase 9)

## 1. One-time Supabase setup
1. Create a project at supabase.com (Free tier is fine for ≤150 members).
2. SQL Editor → run migrations **in order**: `0001_init.sql` … `0006_notifications.sql`
   (or `supabase db push` with the CLI).
3. Auth → Providers: keep Email only. **Disable public sign-up**; invite members from
   Auth → Users → "Invite user" (one email per relative).
4. JWT role claim: add an *After Sign-In* hook (or custom claims setting) that copies
   `profiles.role` into `app_metadata.role`, so RLS `jwt_role()` works for treasurer/admin
   policies. Until then, verification actions rely on server-side role checks.
5. Scheduler (reminders + birthday roll-forward), pick one:
   - pg_cron (Database → Extensions → cron):
     `select cron.schedule('roll-events','0 4 * * *','select public.roll_forward_events()');`
     `select cron.schedule('reminders','1 5 * * *','select public.generate_reminders();');`
   - or a Vercel Cron / GitHub Action daily hit to a service-role Edge Function calling both.
6. Env vars (Project Settings → API): copy URL + anon key into the app's `.env.local`;
   service-role key only in server env (`SUPABASE_SERVICE_ROLE_KEY`) if a job needs it.

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
4. Send invites in batches of ~25 (Supabase invite rate limits); share the printed card:
   “Check email for your invite → set password → open <domain> → Add to Home Screen”.

## 4. Treasurer SOP (Mission Fund)
- Daily/weekly: open Mission Fund → verify each pending payment against bank statement,
  capture the UPI/bank reference. **Never mark cash as verified without a receipt.**
- Month-end: Reconcile tab → import bank CSV → match rows → any unmatched row must get an
  explanation label before the month can be closed.
- Reports tab → generate monthly statement → print/PDF to the family group.
- Corrections: always via *Reverse* (creates a new negative audit trail entry) — never edit
  a verified row directly.

## 5. Security checklist (verify before go-live)
- [ ] All 6 migrations applied; `revoke` statements ran without error.
- [ ] Public sign-up disabled; only invited emails can create sessions.
- [ ] Service-role key exists ONLY in server env (never in git, never NEXT_PUBLIC_*).
- [ ] Spot-check RLS: signed-out request to `/directory` redirects; member cannot UPDATE
      contributions of others (test with two accounts).
- [ ] Audit log grows on profile edits and all fund transitions.
- [ ] Backups: enable Supabase daily PITR or weekly `pg_dump` export.
