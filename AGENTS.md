# AGENTS.md — Permanent Project Specification for Marky

This document is the **permanent source of truth** for Marky's product requirements, system architecture, database schema, security rules, design system, and permanent engineering decisions.

---

## 1. Product Goal

Marky is a clean, intelligent, content-first curation and reading platform. It aggregates content from multiple sources (RSS feeds, web pages, Medium, X/Twitter permitted extraction) and presents users with a personalized, uncluttered reading feed tailored to their selected topics of interest.

The goal of Marky is to provide a calm, high-quality editorial environment for reading, saving, and managing web content without algorithm-driven clutter, noisy ads, or distracting social mechanics.

---

## 2. V1 Scope

Marky V1 includes the following core features:

1. **Authentication**: Multi-provider sign-in via Clerk supporting Google, LinkedIn, and Email/Password.
2. **User Onboarding & Interest Management**: Topic interest selection during onboarding and source management.
3. **Database Architecture & RLS**: Supabase Postgres with strict Row-Level Security policies.
4. **Design System**: Warm editorial design aesthetic (paper/off-white background, charcoal text, vermillion accent, clean serif/sans typography, subtle borders, content-first UI).
5. **Content Ingestion Engine**: Source-adapter architecture with capability-based RSS parsing, permitted web content extraction, Medium ingestion adapter, and X/Twitter permitted access path adapter.
6. **Validation, Deduplication & Fallback**: Deduplication by `source_id` + normalized `canonical_url` hash, schema validation, and exponential backoff retries.
7. **Source-Grounded Accuracy & Untrusted Input Safety**: Original source/URL retention, strict handling of user inputs as untrusted, no fabricated metadata, and no ungrounded truth assertions.
8. **Manual URL Submission**: Flow for users to paste a URL and extract content into their collection.
9. **Personalized Feed**: Feed score based on interest relevance and recency decay with configurable scoring weights.
10. **Feed Filtering & Actions**: Filter by interest, read/unread state, and saved status; actions for save/unsave, mark as read/unread, and item deletion.
11. **Print & Responsive Layouts**: Fully responsive layouts (mobile, tablet, desktop) and print-optimized stylesheet.
12. **System States**: Elegant skeleton loaders, content-first zero/empty states, and error alerts.

---

## 3. V2 / Out-of-Scope Functionality

The following features are explicitly **out of scope for V1**:

- AI recommendation engines, vector embeddings, and semantic similarity search
- AI automated summarization or rewrite engines
- Paywall subscriptions or monetized content paywalls
- Social features: comments, likes, following other users, public sharing feeds
- User collections, folders, or nested tag hierarchies
- In-app notification centers or push notification services
- Native mobile applications (iOS/Android binaries)
- Complex reading analytics, velocity tracking, or reading habit dashboards
- Automated video/audio transcoding pipelines

> [!IMPORTANT]
> **V2 Scope Protection Rule**: V2 features must not be implemented during V1 unless a feature is strictly required for the correct operation, security, reliability, or architecture of an explicitly approved V1 feature. Do not introduce V2 functionality merely because it is convenient, interesting, or easy to add.

---

## 4. Technology Stack & Runtime Specifications

- **Runtime Environment**: Node.js 22+ (required by current Supabase client library ecosystem).
- **Framework**: Next.js (App Router, React, TypeScript strict mode).
- **Authentication**: Clerk (`@clerk/nextjs`).
- **Database**: Supabase Postgres with supported `@supabase/supabase-js` v2 line.
- **Supabase API Key Model**:
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → Browser/client-side access (Publishable key).
  - `SUPABASE_SECRET_KEY` → Server/backend-only elevated access (Secret key; never exposed to client).
  - *Legacy equivalents*: `anon` (legacy for Publishable key), `service_role` (legacy for Secret key).
- **Security**: Supabase Row-Level Security (RLS) policies enforcing database authorization regardless of key type.
- **Styling**: Vanilla CSS / CSS Modules / Tailwind design tokens adhering to Marky editorial guidelines.
- **Icons & Animations**: Lucide React (`lucide-react`) and Framer Motion (`framer-motion`).
- **Ingestion Capabilities**: Maintained Node.js packages for RSS parsing, web extraction, and URL canonicalization.

---

## 5. Application Architecture

Marky follows a decoupled component-driven architecture:

```text
[ Client (Next.js App Router) ]
         │
         ├── Auth Layer (Clerk React / SDK)
         ├── UI Components (Warm Editorial Design Tokens)
         └── Data Layer (Supabase JS Client + RLS using Publishable Key)
         
[ Backend / Server Routes ]
         │
         ├── Source Ingestion Adapters (RSS / Web Extractors using Secret Key)
         ├── Validation & Deduplication Engine (Source ID + Canonical URL)
         └── Feed Ranking Processor (Interest Match + Recency Decay)

[ Database (Supabase Postgres) ]
         │
         ├── profiles, interests, user_interests
         ├── sources, content_items, content_item_interests
         └── saved_items (with is_read, saved_at)
```

---

## 6. Authentication Requirements

### 6.1 Clerk Integration
- Clerk serves as the primary authentication authority.
- Supported Auth Methods:
  1. Google OAuth
  2. LinkedIn OAuth
  3. Email / Password (with email verification)
- Clerk manages session state, password resets, multi-factor settings, and OAuth token exchanges.

### 6.2 Clerk + Supabase Identity Integration
- **Division of Responsibility**:
  - `Clerk` = Authentication, user identity management, credentials, OAuth providers.
  - `Supabase` = Application database, relational storage, domain data.
  - `RLS` = Database-level authorization enforcing access boundaries.
- User identity is propagated from Clerk to Supabase using supported Clerk token integration (e.g., Clerk Supabase JWT / token integration or webhook-synced `profiles` table mapped by `clerk_user_id`).
- No duplicate user identity management system shall be created.

---

## 7. Supabase Database Architecture & Schema

The database uses the `content_items` and `saved_items` domain models.

### 7.1 Table Specifications

#### `profiles`
Stores user application profile information.
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `clerk_user_id` (text, unique, not null)
- `email` (text, not null)
- `full_name` (text)
- `avatar_url` (text)
- `onboarded` (boolean, default `false`)
- `created_at` (timestamptz, default `now()`)
- `updated_at` (timestamptz, default `now()`)

#### `interests`
Master list of topic interests.
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `name` (text, not null, unique)
- `slug` (text, not null, unique)
- `description` (text)
- `created_at` (timestamptz, default `now()`)

#### `user_interests`
Junction table mapping users to their selected interests.
- `user_id` (uuid, references `profiles(id)` on delete cascade, primary key part 1)
- `interest_id` (uuid, references `interests(id)` on delete cascade, primary key part 2)
- `created_at` (timestamptz, default `now()`)

#### `sources`
Tracks RSS feeds and website content sources.
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `title` (text, not null)
- `source_type` (text, not null, e.g., `'rss'`, `'medium'`, `'x'`, `'web'`)
- `feed_url` (text)
- `site_url` (text)
- `is_active` (boolean, default `true`)
- `created_at` (timestamptz, default `now()`)

#### `content_items`
Ingested articles, posts, and web submissions.
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `source_id` (uuid, references `sources(id)` on delete set null)
- `canonical_url` (text, not null)
- `url_hash` (text, not null) -- SHA-256 hash of normalized canonical URL
- `title` (text, not null)
- `summary` (text)
- `body_content` (text)
- `author` (text)
- `published_at` (timestamptz)
- `created_at` (timestamptz, default `now()`)

#### `content_item_interests`
Tagging junction connecting content items to topics.
- `content_item_id` (uuid, references `content_items(id)` on delete cascade, primary key part 1)
- `interest_id` (uuid, references `interests(id)` on delete cascade, primary key part 2)

#### `saved_items`
User interactions with content items (saved items, read status).
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `user_id` (uuid, references `profiles(id)` on delete cascade, not null)
- `content_item_id` (uuid, references `content_items(id)` on delete cascade, not null)
- `is_read` (boolean, default `false`)
- `saved_at` (timestamptz, default `now()`)
- Unique constraint: `(user_id, content_item_id)`

---

## 8. Row-Level Security (RLS) & Authorization

Every table in Supabase must have RLS enabled (`ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`).

### RLS Policy Rules:
1. `profiles`: Users can read and update only their own profile matching their authenticated ID.
2. `interests`: Publicly readable by all authenticated users; insert/update restricted to backend admin using `SUPABASE_SECRET_KEY` (legacy equivalent: `service_role`).
3. `user_interests`: Users can select, insert, and delete only records where `user_id` corresponds to their authenticated profile.
4. `sources` & `content_items`: Readable by all authenticated users. Insert/update restricted to background ingestion processes using `SUPABASE_SECRET_KEY` (legacy equivalent: `service_role`).
5. `content_item_interests`: Readable by all authenticated users.
6. `saved_items`: Users can select, insert, update, and delete only records where `user_id` matches their authenticated profile.

---

## 9. Content Ingestion Architecture

### 9.1 Source-Adapter Framework
The ingestion engine uses a plugin-style adapter architecture:

```text
               ┌──────────────────────┐
               │ Ingestion Controller │
               └──────────┬───────────┘
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌───────────┐       ┌───────────┐       ┌───────────┐
│    RSS    │       │  Medium   │       │ X / Web   │
│  Adapter  │       │  Adapter  │       │  Adapter  │
└─────┬─────┘       └─────┬─────┘       └─────┬─────┘
      │                   │                   │
      └───────────────────┼───────────────────┘
                          ▼
            ┌──────────────────────────┐
            │ Validation & Deduper     │
            │ (Source ID + URL Hash)   │
            └─────────────┬────────────┘
                          ▼
            ┌──────────────────────────┐
            │  Database (content_item) │
            └──────────────────────────┘
```

### 9.2 Ingestion Capabilities
Required ingestion capabilities:
- **Reliable RSS Parsing**: Parsing standard RSS 2.0, Atom, and JSON feeds into standard content schemas.
- **Permitted Web Extraction**: Extracting main content text, headline, author, and published date from HTML documents.
- **URL Canonicalization**: Cleaning tracking params (`utm_*`, `ref`, `fbclid`) to yield normalized canonical URLs.
- **Validation**: Schema verification ensuring non-empty title and valid canonical URL.
- **Retry & Fallback Handling**: Up to 3 retry attempts with exponential backoff on network failures; graceful degradation if full body content is unextractable (falling back to item summary/snippet).

### 9.3 Deduplication Strategy
- Primary deduplication key: `source_id` + `url_hash` (SHA-256 of normalized canonical URL).
- Before inserting a new `content_item`, the pipeline computes `url_hash`. If an entry matching `url_hash` exists under the same `source_id` or canonical URL, the insert is skipped (or timestamp refreshed).

---

## 10. Source-Grounded Accuracy & Safety Principles

1. **Original Source Integrity**: Every content item must explicitly retain and display its original source name, author, and canonical/original URL link.
2. **No Metadata Fabrication**: Marky must never hallucinate or invent missing publication dates, authors, or content snippets. If missing, indicate `Date unknown` or `Unknown author`.
3. **No Truth Assertions**: Marky must never claim external information is "100% true" or verified fact. Content is presented strictly as source-grounded material from external originators.
4. **Untrusted Input Safety**: All user-submitted URLs and raw extracted HTML content must be treated as untrusted input. HTML content must be sanitized before rendering to eliminate script injection (XSS).

---

## 11. Feed Engine & Ranking Logic

### 11.1 V1 Ranking Logic
Feed ranking is computed dynamically as a function of **Interest Relevance** and **Recency Decay**:

$$\text{Feed Score} = (w_{\text{interest}} \times \text{Interest Relevance Score}) + (w_{\text{recency}} \times \text{Recency Score})$$

- **Interest Relevance Score**: Higher score when content item topics match user's selected interests in `user_interests`.
- **Recency Score**: Exponential decay function based on hours elapsed since `published_at` (half-life decay of ~48 hours).
- **Recency Definition**: In V1, recency is based on the original content's `published_at` timestamp. It must not use `saved_at`, `submitted_at`, or `fetched_at` as the content recency signal. If the original publication timestamp is unavailable, use a clearly defined fallback and record that limitation rather than silently treating the item as recent.
- **Centralized Configuration**: Scoring weights $w_{\text{interest}}$ and $w_{\text{recency}}$ must be kept in a centralized configuration module so they can be easily tuned without modifying feed architecture.

### 11.2 Filtering Capabilities
- **By Interest Topic**: Filter content matching a specific interest category or view "All Interests".
- **By Read State**: Toggle between "All Items", "Unread Only", and "Read Only".
- **By Saved State**: Toggle between "Feed" and "Saved Items".

---

## 12. UI/UX Requirements & Warm Editorial Design System

Marky adopts a **Warm Editorial** aesthetic inspired by physical print publications, literary journals, and premium distraction-free tools (e.g. Readwise Reader, NYT, Substack, Medium).

### 12.1 Color Palette & Design Tokens
- **Paper Background (Primary)**: `#FBF9F5` (Soft warm off-white)
- **Paper Background (Secondary)**: `#F4F0EA` (Muted paper container / card surface)
- **Paper Surface (Card/Modal)**: `#FFFFFF`
- **Charcoal Text (Primary)**: `#1F1F1F` (High contrast, warm dark charcoal)
- **Charcoal Text (Muted)**: `#57534E` (Warm gray secondary typography)
- **Vermillion Accent**: `#E03E2F` (Warm literary vermillion for active tabs, primary CTAs, highlight badges)
- **Vermillion Hover**: `#C4321A`
- **Border / Rule Color**: `#E6E2DA` (Subtle thin warm borders)

### 12.2 Typography Hierarchy
- **Serif Display/Headings**: Refined editorial serif font family (`Newsreader`, `Lora`, or fallback `Georgia`, `serif`). Used for article titles, page headlines, and article reader headings.
- **Sans-Serif Body/UI**: Clean geometric/humanist sans-serif (`Inter`, `Plus Jakarta Sans`, or fallback `system-ui`, `sans-serif`). Used for navigation, metadata tags, body preview snippets, and buttons.
- **Font Scale**:
  - Page Title: 2.25rem (36px), Serif, font-weight 600
  - Item Title: 1.25rem (20px) to 1.5rem (24px), Serif, font-weight 600
  - Body Text: 1.0rem (16px), Sans-serif, line-height 1.6
  - Caption / Metadata: 0.875rem (14px), Sans-serif, color `#57534E`

### 12.3 System States & Interactions
- **Loading State**: Custom ghost news-card skeletons styled with paper tokens.
- **Empty State**: Editorial zero-data states with helpful prompts and vermillion primary action buttons.
- **Error State**: Non-disruptive warm banner notifications with retry triggers.
- **Save State Feedback**: Immediate visual feedback (icon toggle and toast confirmation) upon saving or unsaving items.

### 12.4 Responsive Behavior
- **Mobile (<640px)**: Single column stacked stream, sticky header with interest bar.
- **Tablet (640px - 1024px)**: Single column optimized reading pane with collapsible sidebar navigation.
- **Desktop (>1024px)**: Dual column layout (Navigation & Interest sidebar on left, main content stream in center/right).

### 12.5 Print Behavior & Stylesheet
- Embedded `@media print` rules:
  - Hide navigation bars, sidebars, interactive action buttons, and background colors.
  - Set text to pure black on white background (`#000000` / `#FFFFFF`).
  - Render full article titles, source attribution, canonical URL reference, and body content cleanly formatted for paper print.

---

## 13. Quality, Verification & Engineering Constraints

1. **Strict TypeScript Mode**: No `any` types permitted; all domain models explicitly typed.
2. **Typecheck & Linting Clean**: Zero unhandled ESLint errors or TypeScript compilation failures.
3. **Database RLS Verification**: Every table must be tested to ensure non-owner users cannot access or modify unauthorized data rows.
4. **Browser Flow Verification**: Core workflows (Auth, Onboarding, Ingestion, Feed rendering, Save/Unsave, URL Submission) verified via browser testing.
5. **No Placeholder UI**: No dummy "Lorem Ipsum" text or unhandled empty buttons in production states.

---

## 14. Definition of Done

A feature or milestone is considered **Done** only when:
1. Code implementation is complete.
2. TypeScript compilation passes without errors.
3. ESLint checks pass clean.
4. Application builds successfully.
5. Database schema & RLS policies are applied and verified.
6. Core workflow is verified in browser.
7. `PROGRESS.md` is updated with verification results and next steps.
