# Marky implementation progress

## 2026-08-28

### Completed

- Next.js App Router shell with responsive editorial feed UI.
- Demo feed with For You, Trending, Latest, interest/read/saved filters.
- Save/read interactions and secure manual-link modal.
- Deterministic ranking and URL canonicalization utilities with unit tests.
- Supabase migration with seeded interests and Medium sources, explicit grants, indexes, and Clerk-subject RLS policies.
- Clerk provider/auth controls that activate when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is configured.
- Supabase-backed live feed and submission/cron route contracts.
- Vercel cron schedule and deployment-ready environment documentation.

### Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed (2 files, 6 tests).
- `npm run build` — initial attempt reached Next.js production compilation; Google font fetching was removed to make the build offline-safe. Re-run after the live-auth changes.
- Live-auth changes: `npm run typecheck` — passed; `/api/feed?view=trending` — HTTP 200 in demo mode.

### Required external setup

- Create and select a dedicated Marky Supabase project; no remote project was changed automatically.
- Configure Clerk’s native Supabase third-party auth integration.
- Add environment values from `.env.example` locally and in Vercel.
- Connect the user-owned GitHub repository to Vercel; no unrelated public repository was modified.
