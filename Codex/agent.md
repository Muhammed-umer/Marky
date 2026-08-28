# Marky Codex Agent Guide

This file contains the local agent guidance for working on the Marky project.

## Project rules

- Treat `docs/MARKY_PROJECT_SPEC.md` as the product and engineering source of truth.
- Keep product documentation in `docs/`.
- Keep application code in `src/` and database migrations/configuration in `supabase/`.
- Never commit secrets. Use `.env.example` as the template for required environment variables.
- Preserve source attribution, missing-metadata disclosures, URL canonicalization, and security constraints defined by the specification.
- Run type checking and the relevant tests after changes.

## Next.js guidance

This is **not the Next.js you know**. The project uses a current Next.js release with breaking changes. Before modifying Next.js code, read the relevant guide in:

```text
node_modules/next/dist/docs/
```

Heed deprecation notices and verify APIs against the installed version. The root `AGENTS.md` contains the generated Next.js agent-rules block; keep it intact.

## Supabase and authentication

- Use Clerk as the identity authority.
- Use Supabase publishable keys only in browser code.
- Keep Supabase secret keys and Clerk secret keys server-only.
- Enable RLS on every exposed table and authorize using the immutable Clerk token subject.
- Apply schema changes through the migration workflow in `supabase/migrations/`.

## Verification commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Documentation map

- `docs/MARKY_PROJECT_SPEC.md` — complete V1 specification
- `docs/PROGRESS.md` — implementation progress and verification
- `docs/NEW_UPDATES.md` — current update summary
