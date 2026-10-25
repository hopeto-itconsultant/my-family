# Our Family Home — Implementation Plan & Mission Fund Prototype

A private family community web app for **50–150 relatives across multiple family branches**.

> **Status:** This repository currently contains a **UI prototype of the Mission Fund dashboard** (`/mission-fund-prototype`) and this implementation plan. The full Next.js + Supabase application is intentionally *not* built in one step — see the phased roadmap below.

---

## 1. Technology decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Server Components for data, route-level auth, one deployable app, PWA via `manifest.webmanifest` + service worker |
| Backend | **Supabase**: PostgreSQL, Auth (email/magic-link), Storage (private buckets), Edge Functions, Row Level Security | Family-scale (≤150 users) fits the free/Pro tier; RLS gives database-enforced permissions instead of trusting the client |
| Styling | **Tailwind CSS**, mobile-first | Prototype already uses Tailwind v4 utility classes; bottom tab-bar layout, safe-area insets, `min-h-dvh` |
| Money | **Integer paise in `BIGINT` columns** (₹1 = 100 paise) | No floating-point rounding errors in ledgers; Indian formatting (lakh grouping) at the edge only |
| Currency display | `formatPaise()` helper (see prototype `src/lib/money.ts`) | Single source of truth for ₹ rendering |

---

## 2. Data model (Supabase schema outline)

```
profiles        id (uuid, = auth.users.id), name, branch_id, role, avatar_url, phone
branches        id, name, order_hint
family_tree     parent_id, child_id, relation_type          (tree view feature)
events          id, title, kind(birthday|anniversary|meetup), occurs_on, venue
prayer_requests id, body, is_urgent, answered_at            (soft privacy flags)
achievements    id, member_id, title, date
photos/assets   storage objects + metadata rows (vehicles, assets, history docs)

-- Mission Fund --
fund_members         profile_id, monthly_pledge_paise, joined_on
contributions        id, member_id, kind(monthly|voluntary), month,
                     amount_paise BIGINT, method(bank-transfer|upi|cash),
                     status(declared|pending_verification|verified|rejected),
                     reference TEXT, note, declared_at, verified_at, verified_by
                     CHECK (status <> 'verified' OR verified_by IS NOT NULL)
expenses             id, title, category, amount_paise BIGINT, purpose,
                     status(submitted|approved|paid|rejected), requested_by,
                     approved_by, approved_at, receipt_storage_path
audit_log            id, at, actor_id, action, entity, entity_id, detail JSONB
                     (append-only: no UPDATE/DELETE grants for any role)
bank_statement_rows  imported CSV/OFX lines used by reconciliation
reconciliations      links bank_statement_row -> contribution match, run_by, run_at
```

### Balance rule (the single most important invariant)

```
available_balance = SUM(contributions.amount_paise WHERE status = 'verified')
                  - SUM(expenses.amount_paise       WHERE status = 'paid')
```

- `declared` and `pending_verification` are **visible to the whole family but never counted as received**.
- Only a **treasurer/admin** may move a row into `verified`, and verification requires a bank/UPI reference captured during reconciliation.
- Balance is computed in Postgres (SQL view or `SECURITY DEFINER` RPC), so it can't drift from the rows.

---

## 3. Security & permissions (explicit requirements)

These are **release blockers**, not nice-to-haves:

1. **RLS on every table.** `auth.jwt() -> app_role` claim (synced from `profiles.role`) drives policies:
   - `SELECT` on `contributions`, `expenses`, `audit_log`: allowed for **all authenticated family members** (family-wide visibility requirement).
   - `INSERT` on `contributions` with `status IN ('declared','pending_verification')`: member (own declared) or treasurer (manual bank/UPI records).
   - `UPDATE contributions SET status='verified'`: **treasurer/admin only**, enforced by policy *and* a trigger that stamps `verified_by/verified_at`.
   - `UPDATE expenses.status → approved/rejected`: admin/treasurer only; `→ paid`: treasurer only, and only when a receipt exists in Storage.
   - `audit_log`: INSERT by triggers only; **no UPDATE/DELETE grants to anyone**, including admins.
2. **Private Storage buckets** for receipts/photos (`INSERT`/`READ` policies per role); signed URLs, short expiry, never public.
3. **Secrets never leave the server.** `SUPABASE_SERVICE_ROLE_KEY` and any bank/UPI credentials live only in server env vars (Vercel project secrets / Supabase Edge Function secrets). The browser only ever sees `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `.env*` is git-ignored; nothing sensitive is committed.
4. **No payment gateway assumed.** Payments are manual bank/UPI/cash records; if a PSP (e.g., Razorpay) is added later, use a Server Action + webhook with signature verification — never trust client-side "payment success".
5. **Writes go through Server Actions / Edge Functions** that re-validate amounts (positive integers), state transitions (e.g., `rejected → verified` is illegal), and actor roles — the DB policies are the last line of defense, not the first.
6. **Append-only corrections:** an erroneous verified entry is fixed by reversal entries recorded in `audit_log`, never silent edits.

---

## 4. Phased roadmap (do not build everything at once)

| Phase | Scope | Deliverable |
|---|---|---|
| **0 ✅ done here** | Mission Fund dashboard prototype (this repo) | Interactive UI spec for flows, states, roles |
| **1 ✅ built (`/app`)** | Repo scaffold: Next.js 16 + TS + Tailwind v4 + Supabase SSR clients, middleware auth gate, login/logout, invite-only sign-up, first-user-becomes-admin trigger, PWA manifest + icons, `/setup` guide | Working app shell wired to `supabase/migrations/0001_init.sql` |
| **2a ✅ built (`/app`)** | Member directory + branches (search, branch grouping, self-profile edit) | `/directory`, `/home` pages over RLS-protected `profiles` |
| **2b ✅ built (`/app`)** | Family tree edges (parent/spouse/sibling) + generation view, cycle detection, coordinator-only "Link relatives" sheet | `/tree` over `0002_tree_events.sql` (`family_relations`, pure engine in `src/lib/tree.ts` with unit tests) |
| **3 ✅ built (`/app`)** | Birthdays/anniversaries/meetups: month-grouped 60-day feed, add-event sheet (members may self-add birthdays only), `roll_forward_events()` for recurring dates | `/events`; email reminders deferred to Phase 9 (needs SMTP secrets + cron) |
| 4 | Prayer requests + achievements | Posting, gentle moderation |
| 5 | History, photos, vehicles, assets | Private Storage galleries, timeline |
| 6 | **Mission Fund MVP** (port this prototype) | Contributions lifecycle, treasurer verification, audit log, balance views |
| 7 | Expenses + receipts + approvals | Approval workflow, receipt upload, financial reports (monthly/P&L-style) |
| 8 | Reconciliation | Bank statement CSV import, matching UI, discrepancy report |
| 9 | PWA hardening + rollout | Offline read cache, install prompts, family onboarding docs |

Each phase ships behind real RLS; the prototype's mock data (`src/data/mockData.ts`) is clearly labeled illustrative and must **never be seeded into production**.

---

## 5. The prototype in this repo

`mission-fund-prototype/` — Vite + React + TypeScript + Tailwind v4 (fastest way to iterate on the dashboard before Phase 6 ports it to Next.js).

**What it demonstrates**
- Mobile-first dashboard: hero **verified balance** card, pending-vs-declared separation, branch-wise collection progress.
- Contribution lifecycle UI: `declared → pending_verification → verified/rejected`, with explicit "⚠ not counted until verified" messaging everywhere.
- **"Record bank/UPI payment" sheet** — creates a *pending* record only (never "received").
- Treasurer verify/reject flow with bank-reference capture; expense approve → disburse-with-receipt flow.
- Append-only **audit timeline**.
- A **"View as" role switcher** (member/coordinator/treasurer/admin) proving which controls hide per role — in production this comes from Supabase Auth claims, not a dropdown.
- All arithmetic in integer paise; Indian lakh-format currency display.

**Run it locally**
```bash
cd mission-fund-prototype
npm install
npm run dev        # http://localhost:5173  (mobile viewport recommended)
npm run build      # type-check + production bundle (verified passing)
```

---

## 6. Exporting / committing to GitHub

The work lives in `/workspace` (a git repo on branch `main`). From your own machine after cloning/downloading this workspace:

```bash
git add .
git commit -m "feat: Mission Fund dashboard prototype + implementation plan"
git remote add origin https://github.com/<you>/our-family-home.git
git push -u origin main
```

Or create the repo first on GitHub ("New repository" → *don't* initialize with README since one exists), then push as above. Recommended: keep `mission-fund-prototype/` as-is now, and start the Next.js app at the repo root in Phase 1 (or move the prototype under `prototype/`). Enable **branch protection on `main`** + pull-request review, and add a pre-commit secret scan (e.g., gitleaks) so tokens can never be committed.

## 7. What needs a separate environment / setup steps

| Item | Where it must happen | Notes |
|---|---|---|
| Node 20+, editor, git | Your local machine | Prototype was built & verified here; full app runs locally too |
| Supabase project creation | supabase.com dashboard | Choose region near family; enable email auth + invite-only access |
| Schema migrations, RLS policies, triggers, views | `supabase/migrations/*.sql` via `supabase db push` or CLI local dev (`supabase start` needs Docker) | Review every policy in PR; test with two throwaway accounts per role |
| Secrets (`SERVICE_ROLE_KEY`, DB URL, SMTP) | Vercel/Supabase env settings | Never in code, never in `.env.local` committed to git |
| Private Storage buckets + policies | Supabase dashboard or migration SQL | Receipts/photos; signed URLs only |
| Bank statement exports (CSV/OFX) | Manual download by treasurer, then upload in-app | No bank API assumed; reconciliation is semi-automatic |
| Deployment | Vercel (Next.js) + Supabase hosting | Custom domain, HTTPS required for PWA install; add CSP headers |
| Family onboarding | Separate task | Invite emails, WhatsApp group for UPI confirmations, treasurer SOP document |

---

## 8. Deliberate non-goals (for now)

- No online payment collection/gateway integration (manual bank/UPI recording only, as specified).
- No invented "real" transactions — sample rows are labeled prototype data.
- No multi-family tenancy; single family instance keeps RLS simple.
