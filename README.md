# Our Family Home

Private family community web app for 50–150 relatives across multiple branches — family tree, events, prayer requests, history, and a transparent **Mission Fund** with treasurer verification, expense approvals and an audit trail.

📖 **Read [`PLAN.md`](./PLAN.md)** for the full implementation plan, Supabase schema outline, security/RLS requirements and phased roadmap.

## Current state

- ✅ **Phase 0:** polished, mobile-first **Mission Fund dashboard prototype** in [`mission-fund-prototype/`](./mission-fund-prototype) (React + TypeScript + Tailwind). It demonstrates contribution lifecycle (`declared → pending_verification → verified/rejected`), manual bank/UPI recording that never counts as received until verified, expense approval flow, role-based controls, audit timeline, and integer-paise money math.
- ⏳ The production Next.js + Supabase app follows the phased roadmap in `PLAN.md`. Sample data in the prototype is clearly labeled illustrative and must never be seeded into a real database.

## Run the prototype

```bash
cd mission-fund-prototype
npm install
npm run dev        # http://localhost:5173 — open in a mobile viewport
npm run build      # type-check + production bundle
```

## Committing to GitHub

```bash
git add .
git commit -m "feat: Mission Fund dashboard prototype + implementation plan"
git remote add origin https://github.com/<you>/our-family-home.git
git push -u origin main
```

Never commit `.env*` files or service-role keys; see the security section of `PLAN.md`.
