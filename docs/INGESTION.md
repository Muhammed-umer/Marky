# Marky Ingestion Architecture & Scheduler Guide

This document describes how Marky ingests RSS, Atom, and direct tech blog feeds, and how recurring scheduled ingestion is set up using Supabase Cron (`pg_cron`) and Supabase Net (`pg_net`).

---

## 1. Overview Architecture

```
[ Supabase pg_cron ] 
       │ (Every 15 min: */15 * * * *)
       ▼
[ public.trigger_marky_ingestion() ] ──(pg_net HTTP POST)──► [ /api/cron/ingest ]
                                                                      │
                                                       (Authorization: Bearer <CRON_SECRET>)
                                                                      │
                                                                      ▼
                                                       [ Ingest & Deduplicate Items ]
```

1. **Ingestion Core**: `/api/cron/ingest` is the Next.js API route that coordinates source checking, RSS/Atom fetching, SSRF-safe response handling, normalization, deduplication, auto-classification, and database persistence.
2. **Scheduler**: Supabase Cron (`pg_cron`) runs a database job every 15 minutes (`*/15 * * * *`).
3. **HTTP Dispatcher**: `pg_cron` executes `public.trigger_marky_ingestion()`, which uses `pg_net` (`net.http_post`) to make an authenticated HTTP POST request to `/api/cron/ingest`.
4. **Secrets Management**: Database GUC parameters (`app.settings.cron_secret` and `app.settings.marky_cron_url`) supply credentials dynamically at runtime. Zero secrets are committed to source code or migrations.

---

## 2. Setting Up Ingestion Locally or in Production

### Step A: Run Database Migration
Apply the migration to enable `pg_cron`, `pg_net`, and create the trigger job:

```bash
npx supabase migration up
# or push to your remote project:
npx supabase db push
```

### Step B: Configure Secrets in Database Settings

Run the following SQL commands in your Supabase SQL Editor or via `psql` to configure the target URL and shared secret:

#### Local Development:
```sql
ALTER DATABASE postgres SET app.settings.marky_cron_url = 'http://localhost:3000/api/cron/ingest';
ALTER DATABASE postgres SET app.settings.cron_secret = 'dev_cron_secret';
```

#### Production (Hosted Supabase):
```sql
ALTER DATABASE postgres SET app.settings.marky_cron_url = 'https://your-domain.com/api/cron/ingest';
ALTER DATABASE postgres SET app.settings.cron_secret = 'your_strong_production_cron_secret';
```

---

## 3. Environment Variables (`.env.local`)

Ensure your Next.js application has `CRON_SECRET` defined matching `app.settings.cron_secret`:

```env
CRON_SECRET=dev_cron_secret
```

---

## 4. Monitoring & Troubleshooting

### Inspect Ingestion Observability Endpoint
Navigate to `/debug/ingestion` (e.g., `http://localhost:3000/debug/ingestion`) in your browser to view:
- Currently active technology sources (12 retained topics, 13 sources)
- Raw feed HTTP responses and parsed content counts
- Recent database items in `content_items`
- Live `pg_cron` job schedule and execution status

### Check Cron History via SQL
Run the following SQL in Supabase SQL Editor to verify past execution logs:

```sql
-- View scheduled cron jobs
SELECT * FROM cron.job;

-- View recent execution history & HTTP status responses
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

### Unschedule or Pause Cron Job
To pause or unschedule ingestion:

```sql
SELECT cron.unschedule('marky-ingestion-cron');
```

To re-enable:
```sql
SELECT cron.schedule('marky-ingestion-cron', '*/15 * * * *', 'SELECT public.trigger_marky_ingestion();');
```
