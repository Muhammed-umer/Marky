# Marky

A source-grounded technology reader built with Next.js, Clerk, and Supabase.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Keep `NEXT_PUBLIC_DEMO_MODE=true` to explore the UI without cloud credentials.
3. Run `npm install` and `npm run dev`.

## Production setup

1. Create a **new Supabase project for Marky** and apply `supabase/migrations/20260828060337_initial_marky_schema.sql` in the SQL Editor.
2. In Clerk, configure the native Supabase third-party authentication integration and add the Clerk session `role=authenticated` claim.
3. Copy the Supabase project URL and publishable key from Project Settings → API Keys.
4. Copy the Clerk publishable and secret keys from the Clerk dashboard.
5. Set all values from `.env.example` in Vercel and set `NEXT_PUBLIC_DEMO_MODE=false`.
6. Connect this GitHub repository to Vercel for preview and production deployments.

The browser only receives the Clerk publishable key and Supabase publishable key. `CLERK_SECRET_KEY` and `SUPABASE_SECRET_KEY` stay server-only. The live feed route provisions a minimal profile on a user’s first authenticated request.

See `docs/MARKY_PROJECT_SPEC.md` for the full product contract, `docs/PROGRESS.md` for implementation status, and `docs/NEW_UPDATES.md` for the change summary.
