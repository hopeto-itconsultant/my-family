# Flexible Multi-Branch / Division / Resource Access Control — Phase 1 Report

**Status: INSPECTION + PROPOSAL ONLY. No schema or code changes made in this phase.**
Awaiting approval before Phase 2 (which introduces additive migrations).

---

## 1. What exists today (verified by inspection)

### Database (`supabase/migrations/0001…0013`, 12 files, ~2,241 lines)
| Area | Current model | Limitation vs. the new requirement |
|---|---|---|
| Identity | `profiles` (1 row per auth user), phone-login shadow email (0007) | ✅ reuse as-is; no duplicate identities needed |
| Branches | `branches` table; **one nullable `profiles.branch_id`** = exactly one branch per person | Cannot express "my branch + wife's branch" memberships |
| Roles | Global enum `family_role` on profiles: `member \| treasurer \| admin` (coordinator merged into treasurer in 0013); mirrored into JWT via `app_metadata.role`; helpers `jwt_role()`, `is_treasurer()`, `is_steward()` | One global role only; not scoped to a branch/division/fund; no Viewer/Editor/Contributor granularity |
| Mission Fund | Single shared ledger: `contributions`, `expenses` (0004). **No fund_id column.** Read policies are `using (true)` (whole family sees everything — per earlier decision). All writes funnel through SECURITY DEFINER transition functions gated by `is_treasurer()`; exactly-one-treasurer enforced by partial unique index (0008) | Cannot have Branch-A fund vs. Shared fund; cannot give one person access to one fund only; treasurer authority is global, not per-fund |
| Other resources | `events`, `prayer_requests` (has `is_private` flag → owner-only), `achievements`, `history_entries`, `photos`, `family_assets` (0002–0003). Reads mostly `using (true)`; writes steward-or-owner | No audience selection (branch/group/shared); no per-resource grants |
| Audit | Append-only `audit_log` (REVOKE UPDATE/DELETE; `log_audit()` helper) | Reusable as-is for membership/permission change history |
| Storage | Private buckets `family-photos`, `receipts`; signed URLs minted server-side after an RLS pass on metadata rows | Metadata rows will inherit resource ACLs; bucket policies unchanged |

### Application (`app/src`)
- Next.js App Router, server components + server actions (`src/app/actions/*`), `@supabase/ssr` clients; service-role client (`lib/supabase/admin.ts`) used **only** for account creation.
- Authorization today is thin and duplicated: `canManage(profile)` in `lib/session.ts` mirrors `is_steward()` SQL; every page/action assumes *global* role + single branch; navigation shell shows all tabs to everyone.
- Caching: `lib/cached.ts` route-caches directory/branches/tree/events — **must become per-audience once content is scoped**, otherwise user A could be served cached content B shouldn't see.
- Tests: pure-function node tests (`*.test.ts`: csv, nicknames, phone, roster, tree). There is currently **no DB-integration test harness** (RLS behavior can only be proven against a real Postgres).

---

## 2. Proposed target model (hybrid: feature tables stay, authorization becomes reusable)

New tables (all additive — nothing dropped):

```
org_units            -- ONE flexible table for branches AND divisions/groups/committees
  id, name, description, kind ('branch'|'group'), parent_id -> org_units (nullable),
  scope ('family'|'branch'|'selected_branches'|'private'), status ('active'|'archived'),
  created_at, created_by

unit_memberships     -- many-to-many with roles & lifecycle
  id, unit_id -> org_units, member_id -> profiles,
  member_role ('administrator'|'coordinator'|'treasurer'|'reviewer'|'editor'|'contributor'|'viewer'),
  status ('invited'|'active'|'suspended'|'revoked'),
  starts_at, ends_at (nullable), granted_by, grant_reason
  UNIQUE (unit_id, member_id)          -- one membership row per person per unit; history lives in audit_log

resource_access      -- explicit grants tying a resource row to an audience
  id, resource_type ('fund'|'event'|'prayer'|'document'|'photo_album'|'asset_register'|'announcement'|...),
  resource_id (uuid of the feature row; NULL until the row exists for staged grants),
  audience_kind ('family'|'unit'|'members'|'owner'),
  audience_unit_id -> org_units (nullable), audience_member_ids uuid[] (nullable),
  permission ('view'|'contribute'|'edit'|'approve'|'export'|'manage')
  CHECK: exactly one of (audience_unit_id / audience_member_ids) set when audience_kind='unit'/'members'

mission_funds        -- first concrete multi-instance resource (reuses existing ledger rows)
  id, name, description, owning_unit_id -> org_units, status, created_at

-- plus: fund_id column added to contributions, expenses (+ statement/report views), NOT NULL defaulting to a seeded "Family Mission Fund" so every existing row keeps belonging somewhere.
```

Roles/permissions are **not** hardcoded per division: a new group = a new `org_units` row; its permissions are rows in `resource_access`. Adding "Benevolence Committee" requires zero code changes.

### Policy evaluation order (documented, deterministic, deny-by-default)
For `(user U, resource row R, permission P)`:
1. **Explicit denial wins**: a membership of R's owning unit with status suspended/revoked denies even if another path would grant.
2. **Owner-direct grants** (`audience_kind='members'` containing U with P or a superset) apply.
3. **Unit grants**: U holds an **active** membership in a unit named in R's `resource_access` with a role whose implied level ≥ P. Role→level ladder: viewer < contributor < editor < approver/reviewer < coordinator/treasurer < administrator.
4. **Scope-based defaults** baked per resource type (e.g., fund ledgers: NO branch-membership default — only explicit `resource_access` grants; events: `scope='family'` means all authenticated members may view).
5. Otherwise: **deny**.

Key rules honored: family relationship ≠ access; branch membership ≠ branch's resources (financial resources always require an explicit fund-level grant, even for branch administrators); global `admin` retains app-management rights but **not** automatic fund visibility (emergency access = time-boxed, reason-required, double-audited grant function — designed in Phase 3, disabled by default).

### RLS implementation strategy (avoid recursive/expensive checks)
One pair of `SECURITY DEFINER STABLE` helpers, mirroring the existing `jwt_role()` pattern:

```sql
can_access(resource_type, resource_id, permission)  -- evaluates the ladder above
visible_unit_ids()                                   -- active memberships of auth.uid()
```
backed by pre-agreed indexes (`unit_memberships(member_id) where status='active'`, `resource_access(resource_type, resource_id)`, GIN on member-id arrays). Policies then read like `using (public.can_access('fund', id, 'view'))`. Helpers validate identity from `auth.uid()` only — never from request payloads. Browser-sent unit/fund IDs are re-validated server-side in actions **and** again inside the policy, satisfying "hiding a button is not security."

Self-elevation prevention: `unit_memberships` INSERT/UPDATE policies allow granting only roles ≤ your own level in that unit (or parent unit), and `granted_by = auth.uid()`; raising anyone to `administrator` requires an existing administrator of that unit; global role stays protected by the existing trigger pattern.

---

## 3. Mission Fund integration (Phase 4 preview)
- Seed one `mission_funds` row **"Family Mission Fund"** owned by a seeded *Shared Family* unit; backfill `fund_id` on all existing `contributions`/`expenses` → **zero data loss**; today's single-ledger behavior is preserved because everyone keeps the existing family-wide `view` grant (converted from `using(true)` into explicit `resource_access` rows during migration).
- New funds get their own balances (existing balance view gains `GROUP BY fund_id`); consolidated reports only via an explicit cross-fund `export` permission.
- Treasurer authority becomes per-fund: `approve/contribute/manage` checked against `resource_access`, replacing the global `is_treasurer()` gate inside the transition functions (they already centralize all writes — small, surgical change). The one-global-treasurer constraint is relaxed to "one treasurer **per fund**."

## 4. Other modules (Phase 5)
Authors pick an audience (me / selected members / group / branch / selected branches / entire family) filtered to options they're entitled to use. First conversions: events, prayers (replace `is_private` with audience='owner'), photos/history/assets behind a `document`-type resource. Directory & family tree remain family-wide (with deceased/private-contact nuances unchanged).

## 5. UI (Phase 6)
`/admin/org` (units CRUD), `/admin/units/[id]/members` (membership mgmt w/ confirmations), fund access screens, a header **branch/division switcher** (context only — never an authorization input), "My resources" list, and an access-audit view over `audit_log`. Unauthorized units/funds/balances are simply absent from queries (enforced by RLS), menus, search, and cache keys.

## 6. Caching risks found now
`unstable_cache`/route caches keyed by nothing must gain a per-user/per-audience key (or be downgraded to per-request cache) for anything that becomes scoped. Fund data is already excluded from route caching — keep it out.

---

## 7. Migration plan (non-destructive, reversible)
1. **0014_org_units.sql** — create `org_units`, backfill from `branches` (kind='branch') + a 'shared_family' unit; add `unit_memberships`, backfill from `profiles.branch_id` (role='administrator' ← current stewards? no: role='member'/viewer baseline; admins assigned explicitly). `profiles.branch_id` kept as a deprecated mirror for one release (compat).
2. **0015_resource_access.sql** — grant tables + `can_access()`/`visible_unit_ids()` helpers + audit triggers; convert current `using(true)` reads into explicit grants.
3. **0016_funds.sql** — `mission_funds`, seed Family Mission Fund, add `fund_id` with backfill, rewrite fund policies/functions to scoped checks. *(first breaking-behavior step — needs explicit approval)*
4. **0017_module_audiences.sql** — events/prayers/documents audience columns + policies.
5. Cleanup migration later drops the `branch_id` mirror once no code references it.

Each migration ships with rollback notes; none drops tables/columns in-place.

## 8. Testing approach (addresses §13 scenarios)
- **Pure TS tests** (existing harness): role-ladder evaluation, audience-picker option filtering, fund-switcher logic.
- **SQL policy tests**: a new `supabase/tests/access_control.sql` scenario suite run against `supabase db start` (local CLI/Docker — **requires your local environment**) asserting each listed scenario, incl. "changing fund_id in the request payload does not grant access", "revoked membership blocks next read/write", "branch admin cannot read restricted fund", "self-grant rejected".
- **Regression checklist**: login by phone, directory, tree, events, prayers, history, fund entry flow, reports — exercised post-migration against the same seeded fixtures.

## 9. Risks
| Risk | Mitigation |
|---|---|
| RLS helper performance (per-row policy calls) | STABLE + memoized within statement, covering indexes, bounded recursion depth on unit hierarchy (no implicit inheritance) |
| Cache leakage across audiences | scoped routes move to per-request cache; CI check forbids `unstable_cache` on resource-scoped paths |
| Breaking the working fund flow | fund_id backfill keeps single-fund behavior identical; per-fund treasurer replaces global treasurer only after both audits pass |
| Two sources of truth during transition (`profiles.role` vs scoped roles) | global role retained solely for app-admin duties; all resource decisions go through `resource_access` from day one of Phase 3 |
| Local Supabase env unavailable to me | migrations + test SQL are authored here, executed by you via `supabase db push` / `psql`; I verify everything buildable/testable short of live DB enforcement |

## 10. Decision points needing your approval before Phase 2
1. Approve the hybrid model above (single `org_units` table for branches+divisions, `unit_memberships`, `resource_access`) — or prefer fully separate `family_branches`/`groups` tables?
2. Confirm **fund transparency rule**: today *everyone* sees the whole ledger. Keep the seeded Family Mission Fund family-visible, while **new** branch funds are visible only to explicit grantees? (Recommended.)
3. Confirm emergency admin access design (time-boxed, logged, off by default) or omit entirely?
4. Confirm we relax "exactly one treasurer globally" → "one treasurer per fund" (needed for multi-fund).

**No files were changed in this phase. Reply approve/amend and I'll implement Phase 2 (org units + memberships + scoped roles, additive migration + tests).**
