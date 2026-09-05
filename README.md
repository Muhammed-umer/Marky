# Marky

A personalized technology reader built with Next.js, Clerk, and Supabase. Marky collects content from configured sources and submitted links, deduplicates it, matches it to topics, and orders a personal feed. See `docs/PRODUCT_VISION.md` for the goal and `docs/PROGRESS.md` for how far the code is from it.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Keep `NEXT_PUBLIC_DEMO_MODE=true` to explore the UI without cloud credentials.
3. Run `npm install` and `npm run dev`.

## Verification

```bash
npm run build      # also regenerates .next/types, which typecheck depends on
npm run typecheck
npm run lint
npm test
```

## Production setup

1. Create a **new Supabase project for Marky**, link it with the Supabase CLI, and apply every migration in `supabase/migrations/` with `supabase db push`.
2. Before the `20260903042358_move_recurring_workers_to_supabase` migration runs, create the Vault secrets `marky_worker_url` (the deployed app origin) and `marky_worker_secret` (the same value as `CRON_SECRET`). The migration fails if they are missing.
3. In Clerk, configure the native Supabase third-party authentication integration and add the Clerk session `role=authenticated` claim.
4. Copy the Supabase project URL and publishable key from Project Settings → API Keys.
5. Copy the Clerk publishable and secret keys from the Clerk dashboard.
6. Set all values from `.env.example` in Vercel and set `NEXT_PUBLIC_DEMO_MODE=false`.
7. Connect this GitHub repository to Vercel for preview and production deployments.

Recurring work is scheduled by Supabase `pg_cron`, not Vercel Cron: source ingestion calls `/api/cron/ingest` every five minutes and link processing calls `/api/cron/process-links` every minute, both with a `Bearer` token read from Vault.

The browser only receives the Clerk publishable key and Supabase publishable key. `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY`, and `CRON_SECRET` stay server-only. The live feed route provisions a minimal profile on a user's first authenticated request.

## Documentation

- `docs/PRODUCT_VISION.md` — product goal and core loop.
- `docs/MARKY_PROJECT_SPEC.md` — V1 engineering baseline, with a status note on divergences.
- `docs/PROGRESS.md` — implementation status, verification results, vision gap.
- `docs/NEW_UPDATES.md` — dated change log.
- `docs/SOURCE_INGESTION.md` — implemented source-access methods and limitations.
- `AGENTS.md` — working rules for coding agents.
