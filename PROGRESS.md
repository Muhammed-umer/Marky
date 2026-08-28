# PROGRESS.md — Live Project Checkpoint

This document reflects the **live, verified implementation state** of the Marky project. It is updated at every completed milestone.

---

## 1. Executive Summary

- **Overall Project Status**: Phase 1 — Specification & Architecture Checkpoint Finalized
- **Current Phase**: Phase 1 — Project Infrastructure & Setup
- **Verified Completion**: 1 of 14 Milestones Completed (Milestone 1 Verified)
- **Last Verified Milestone**: Milestone 1 (Repository + AGENTS.md + PROGRESS.md)
- **Current Active / Next Task**: Milestone 2 — Clerk Authentication Setup

---

## 2. Verified Milestone Checklist

```text
[x] 1. Repository + AGENTS.md + PROGRESS.md
[ ] 2. Clerk authentication (Google, LinkedIn, Email/Password)
[ ] 3. Supabase schema + RLS (profiles, interests, user_interests, sources, content_items, content_item_interests, saved_items)
[ ] 4. Marky design system (Warm editorial CSS tokens: paper background #FBF9F5, charcoal #1F1F1F, vermillion #E03E2F, serif/sans typography)
[ ] 5. Onboarding + interests (Topic selection flow & user interest persistence)
[ ] 6. Source-adapter framework (Pluggable ingestion controller & feed adapters)
[ ] 7. Medium ingestion (Medium adapter implementation)
[ ] 8. X ingestion / currently supported access path (X/Twitter permitted extraction adapter)
[ ] 9. Validation + deduplication + retry/fallback (Source ID + canonical URL hash dedup, retry exponential backoff)
[ ] 10. Manual URL submission (Direct URL extraction flow)
[ ] 11. Personalized feed + ranking (Configurable interest match + published_at recency decay scoring engine)
[ ] 12. Save / unsave / read state (Bookmark management & read toggle)
[ ] 13. Security + end-to-end + browser verification (RLS security audit & core flow browser tests)
[ ] 14. Final UI polish + print verification (Visual check, responsive audit, print stylesheet verification)
```

---

## 3. Detailed Milestone Status Log

### Milestone 1: Repository + AGENTS.md + PROGRESS.md
- **Status**: Completed & Verified `[x]`
- **Rule**: Milestone 1 may be marked complete only after `AGENTS.md` and `PROGRESS.md` have both been created and validated against the complete Marky specification and checkpoint requirements.
- **Implemented**: Created `AGENTS.md` (permanent project specification covering all 34 structural sections, warm editorial design system, capability-based ingestion, identity boundaries, source-grounded accuracy, published_at recency rules, V2 protection clause, Node.js 22+ runtime specification, and Publishable/Secret Supabase key model) and `PROGRESS.md` (living checkpoint framework).
- **Verified**: Verified file presence, markdown integrity, internal section consistency, dependency alignment in `package.json`, and current Supabase key terminology in `.env.example`.
- **Remaining Limitations**: None. Project infrastructure and specification checkpoint initialized.

---

## 4. Verification Matrix

| Verification Category | Status | Last Run Date | Notes |
| :--- | :--- | :--- | :--- |
| **Specification Consistency** | PASS `[x]` | 2026-08-28 | AGENTS.md & PROGRESS.md aligned |
| **TypeScript Typecheck** | Pending Code | - | Target for Milestone 2 |
| **ESLint Check** | Pending Code | - | Target for Milestone 2 |
| **Production Build** | Pending Code | - | Target for Milestone 2 |
| **Supabase RLS Audit** | Pending Code | - | Target for Milestone 3 |
| **Browser Flow Audit** | Pending Code | - | Target for Milestone 13 |
| **Print Stylesheet Audit** | Pending Code | - | Target for Milestone 14 |

---

## 5. Environment & Configuration Requirements

```env
# Clerk Authentication Keys (Required in .env.local)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# Supabase Credentials (Current Terminology Required in .env.local)
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pk_test_...
SUPABASE_SECRET_KEY=sk_test_...

# Legacy Supabase Key Names (For backwards compatibility only)
# NEXT_PUBLIC_SUPABASE_ANON_KEY= (Legacy alias for Publishable key)
# SUPABASE_SERVICE_ROLE_KEY= (Legacy alias for Secret key)
```

---

## 6. Decision Log

- **Decision 1 (Warm Editorial Visual Identity)**: Chosen paper/off-white background (`#FBF9F5` / `#F4F0EA`), charcoal text (`#1F1F1F`), vermillion accent (`#E03E2F`), and serif display titles to create a calm, premium reading experience without SaaS dark mode clutter.
- **Decision 2 (Domain Model Naming)**: Standardized database entities on `content_items` and `saved_items` rather than assuming all content is `articles`.
- **Decision 3 (Deduplication Strategy)**: Defined deduplication key as `source_id` + `url_hash` (SHA-256 of normalized canonical URL).
- **Decision 4 (Modular Feed Ranking & Recency)**: Ranking based on configurable `Interest Relevance + Published Recency` formula using original `published_at` timestamp.
- **Decision 5 (Identity & Auth Boundary)**: Clerk handles all user authentication and OAuth identity; Supabase handles application data and RLS authorization.
- **Decision 6 (V2 Scope Protection)**: V2 features must not be implemented during V1 unless strictly required for the correct operation, security, reliability, or architecture of an explicitly approved V1 feature.
- **Decision 7 (Current Supabase Key Terminology)**: Standardized configuration on `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (client access) and `SUPABASE_SECRET_KEY` (server access), marking legacy `anon` and `service_role` names as compatibility aliases.
- **Decision 8 (Node.js 22+ Runtime)**: Specified Node.js 22+ engine requirement per current Supabase client library documentation.

---

## 7. Known Issues & Bug Tracking

*No active issues currently recorded.*

---

## 8. Immediate Next Action

Proceed to **Milestone 2: Clerk Authentication Setup**. Initialize the Next.js App Router application structure in `d:\Projects\Marky\`, set up Clerk authentication components, and configure sign-in / sign-up routes for Google, LinkedIn, and Email/Password auth.

---

## 9. Agent Session Continuation Header

```text
Project: Marky (Personalized Smart Reader & Content Ingestion Engine)
Current Phase: Phase 1 — Project Infrastructure & Setup
Next Milestone to Execute: Milestone 2 — Clerk Authentication Setup
Repository Root: d:\Projects\Marky\
Specification File: AGENTS.md
Checkpoint File: PROGRESS.md

Instruction for Continuation Agent:
Read AGENTS.md and PROGRESS.md. Inspect d:\Projects\Marky\. Continue Marky from Milestone 2.
Do not redo verified Milestone 1. Do not mark unverified work complete.
```
