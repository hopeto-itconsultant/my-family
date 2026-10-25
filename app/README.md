# Our Family Home — Next.js app (Phase 1 + 2)

Next.js 16 (App Router) + TypeScript + Tailwind v4 + Supabase (Auth, Postgres with RLS).

Run: `npm install && npm run dev` → http://localhost:3000
Without env vars the app shows a guided **/setup** screen instead of crashing.

Env (copy `.env.example` → `.env.local`, git-ignored):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser-safe)
- `SUPABASE_SERVICE_ROLE_KEY` server-only; not used by any page yet and must never be prefixed `NEXT_PUBLIC_`.

Supabase setup: run `../supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`), disable public sign-up, invite relatives by email. First account becomes Admin via DB trigger.
