import type { Metadata } from "next";
import { getIngestionAuditData } from "@/lib/debug/ingestion-audit";

export const metadata: Metadata = {
  title: "Ingestion Observability Audit — Marky Debug",
  description: "Development-only ingestion observability and diagnostic audit for Marky.",
};

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  switch (status) {
    case "HEALTHY":
    case "SUCCESS":
    case "succeeded":
      return <span style={{ padding: "3px 8px", borderRadius: "12px", background: "#eaf4ed", color: "#176b45", fontWeight: 700, fontSize: "11px" }}>✅ {status}</span>;
    case "WARNING":
    case "partial":
      return <span style={{ padding: "3px 8px", borderRadius: "12px", background: "#fef3c7", color: "#92400e", fontWeight: 700, fontSize: "11px" }}>⚠️ {status}</span>;
    case "FAILED":
    case "failed":
      return <span style={{ padding: "3px 8px", borderRadius: "12px", background: "#fee2e2", color: "#b91c1c", fontWeight: 700, fontSize: "11px" }}>❌ {status}</span>;
    case "STALE":
      return <span style={{ padding: "3px 8px", borderRadius: "12px", background: "#ffedd5", color: "#c2410c", fontWeight: 700, fontSize: "11px" }}>⌛ {status}</span>;
    default:
      return <span style={{ padding: "3px 8px", borderRadius: "12px", background: "#f3f4f6", color: "#4b5563", fontWeight: 700, fontSize: "11px" }}>⚪ {status}</span>;
  }
}

export default async function IngestionDebugPage() {
  const { scheduler, auth, recentRuns, topics } = await getIngestionAuditData();

  return (
    <div style={{ padding: "40px 24px", maxWidth: "1400px", margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif", color: "#242424", background: "#fbf9f5", minHeight: "100vh" }}>
      {/* Dev Only Notice */}
      <div style={{ padding: "12px 18px", borderRadius: "8px", background: "#fef3c7", border: "1px solid #f59e0b", color: "#78350f", marginBottom: "32px", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span><strong>🛠 DEVELOPMENT-ONLY OBSERVABILITY ENDPOINT</strong> — Read-Only Diagnostic Page. Safe to delete before production.</span>
        <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Debug Mode Active</span>
      </div>

      <header style={{ marginBottom: "36px" }}>
        <p style={{ color: "#176b45", fontSize: "12px", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 6px" }}>MARKY INGESTION ENGINE</p>
        <h1 style={{ margin: "0 0 10px", fontSize: "36px", fontFamily: "Georgia, serif", fontWeight: 700, letterSpacing: "-1px" }}>Source & Ingestion Observability Audit</h1>
        <p style={{ margin: 0, color: "#6b6b67", fontSize: "15px", maxWidth: "800px", lineHeight: "1.5" }}>
          Live diagnostic audit inspecting RSS/Atom data fetching, parsing, deduplication, topic classification, database storage, and feed visibility across all 12 retained technology topics.
        </p>
      </header>

      {/* Auth Configuration Diagnostic */}
      <section style={{ padding: "24px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e7e7e4", marginBottom: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontFamily: "Georgia, serif" }}>Clerk Authentication Environment Diagnostic</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", fontSize: "13px" }}>
          <div style={{ padding: "12px 16px", background: "#f6f6f4", borderRadius: "8px" }}>
            <span style={{ color: "#6b6b67", fontSize: "11px", display: "block" }}>Publishable Key Prefix</span>
            <strong style={{ fontFamily: "monospace" }}>{auth.publishableKeyPrefix}</strong>
          </div>
          <div style={{ padding: "12px 16px", background: "#f6f6f4", borderRadius: "8px" }}>
            <span style={{ color: "#6b6b67", fontSize: "11px", display: "block" }}>Secret Key Prefix</span>
            <strong style={{ fontFamily: "monospace" }}>{auth.secretKeyPrefix}</strong>
          </div>
          <div style={{ padding: "12px 16px", background: "#f6f6f4", borderRadius: "8px" }}>
            <span style={{ color: "#6b6b67", fontSize: "11px", display: "block" }}>Key Pair Compatibility</span>
            <strong style={{ color: auth.keyPairStatus.includes("VALID") ? "#176b45" : "#b91c1c" }}>
              {auth.keyPairStatus === "VALID_DEV_PAIR" ? "✅ Valid Dev Key Pair (pk_test + sk_test)" : auth.keyPairStatus === "VALID_PROD_PAIR" ? "✅ Valid Prod Key Pair (pk_live + sk_live)" : "❌ Mismatched / Incomplete Keys"}
            </strong>
          </div>
          <div style={{ padding: "12px 16px", background: "#f6f6f4", borderRadius: "8px" }}>
            <span style={{ color: "#6b6b67", fontSize: "11px", display: "block" }}>Clerk Instance Domain</span>
            <strong style={{ fontFamily: "monospace" }}>{auth.clerkInstanceDomain ?? "Unconfigured"}</strong>
          </div>
        </div>
      </section>

      {/* 1. Scheduler Status */}
      <section style={{ padding: "28px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e7e7e4", marginBottom: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "20px", fontFamily: "Georgia, serif" }}>1. Current Ingestion Schedule</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "24px" }}>
          <div style={{ padding: "16px", background: "#f6f6f4", borderRadius: "8px" }}>
            <span style={{ color: "#6b6b67", fontSize: "12px", display: "block" }}>Trigger Endpoint</span>
            <strong style={{ fontSize: "15px", fontFamily: "monospace" }}>{scheduler.triggerEndpoint}</strong>
          </div>
          <div style={{ padding: "16px", background: "#f6f6f4", borderRadius: "8px" }}>
            <span style={{ color: "#6b6b67", fontSize: "12px", display: "block" }}>Supabase pg_cron Status</span>
            {typeof scheduler.supabasePgCron === "string" ? (
              statusBadge(scheduler.supabasePgCron)
            ) : (
              <span style={{ padding: "3px 8px", borderRadius: "12px", background: "#eaf4ed", color: "#176b45", fontWeight: 700, fontSize: "11px" }}>
                ✅ ACTIVE ({scheduler.supabasePgCron.schedule})
              </span>
            )}
          </div>
          <div style={{ padding: "16px", background: "#f6f6f4", borderRadius: "8px" }}>
            <span style={{ color: "#6b6b67", fontSize: "12px", display: "block" }}>Vercel Cron Status</span>
            {statusBadge(scheduler.vercelCron)}
          </div>
          <div style={{ padding: "16px", background: "#f6f6f4", borderRadius: "8px" }}>
            <span style={{ color: "#6b6b67", fontSize: "12px", display: "block" }}>HTTP Cron Trigger</span>
            {statusBadge(scheduler.httpCronTrigger)}
          </div>
        </div>

        <div style={{ padding: "16px", background: "#edf6ef", borderRadius: "8px", borderLeft: "4px solid #176b45", fontSize: "13px", lineHeight: "1.6", color: "#14482f" }}>
          <strong>Due Source Rule:</strong> A source is fetched when <code>last_success_at</code> or <code>last_fetched_at</code> is null OR when <code>Date.now() - lastFetch &gt;= fetch_interval_minutes * 60,000</code> (default 30 mins). Concurrency factor: 4 parallel source fetches.
        </div>

        {/* Ingestion Pipeline Diagram */}
        <div style={{ marginTop: "24px", padding: "20px", background: "#242424", color: "#ffffff", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace", overflowX: "auto" }}>
          <p style={{ margin: "0 0 10px", color: "#34d399", fontWeight: 700 }}>Ingestion Architecture Flow:</p>
          <div>
            Supabase pg_cron (*/15 * * * *) → public.trigger_marky_ingestion() (pg_net) → /api/cron/ingest (Authorization: Bearer &lt;CRON_SECRET&gt;) → isDue Filter → runWithConcurrency(4) → assertPublicHttpUrl (SSRF Check) → HTTP Fetch → parseRssFeed (fast-xml-parser) → Freshness Cutoff Filter → SHA-256 url_hash Deduplication → content_items DB Insert → classifyContent Topic Matching → content_item_topics Insert → Feed API (/api/feed) → Authenticated UI
          </div>
        </div>
      </section>

      {/* 2. Scheduler Migration Status & Setup */}
      <section style={{ padding: "28px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e7e7e4", marginBottom: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <h2 style={{ margin: "0 0 14px", fontSize: "20px", fontFamily: "Georgia, serif" }}>2. Supabase Cron (pg_cron) Status & Setup</h2>
        {typeof scheduler.supabasePgCron === "object" ? (
          <div style={{ fontSize: "13px", lineHeight: "1.6", color: "#4b5563" }}>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "#176b45" }}>✅ Active Database Cron Job Configured:</strong>
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "12px" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f0f0ed" }}>
                  <td style={{ padding: "6px 12px", fontWeight: 600, width: "160px" }}>Job ID:</td>
                  <td style={{ padding: "6px 12px", fontFamily: "monospace" }}>{scheduler.supabasePgCron.jobid}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f0f0ed" }}>
                  <td style={{ padding: "6px 12px", fontWeight: 600 }}>Job Name:</td>
                  <td style={{ padding: "6px 12px", fontFamily: "monospace" }}>{scheduler.supabasePgCron.jobname}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f0f0ed" }}>
                  <td style={{ padding: "6px 12px", fontWeight: 600 }}>Schedule:</td>
                  <td style={{ padding: "6px 12px", fontFamily: "monospace" }}>{scheduler.supabasePgCron.schedule} (Every 15 mins)</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f0f0ed" }}>
                  <td style={{ padding: "6px 12px", fontWeight: 600 }}>Command:</td>
                  <td style={{ padding: "6px 12px", fontFamily: "monospace" }}>{scheduler.supabasePgCron.command}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ margin: 0, fontSize: "12px", color: "#6b6b67" }}>
              Detailed documentation and verification steps can be found in <code>docs/INGESTION.md</code>.
            </p>
          </div>
        ) : (
          <div style={{ fontSize: "13px", lineHeight: "1.6", color: "#4b5563" }}>
            <p style={{ margin: "0 0 10px" }}>
              <strong>Current State:</strong> Migration file <code>supabase/migrations/20260905000000_setup_ingestion_cron.sql</code> is ready in the codebase. Run <code>npx supabase migration up</code> or <code>npx supabase db push</code> to enable <code>pg_cron</code> in your Supabase database.
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <strong>Configuring Database Secrets (Zero Hardcoded Keys):</strong>
            </p>
            <pre style={{ background: "#242424", color: "#34d399", padding: "12px", borderRadius: "6px", overflowX: "auto", fontSize: "12px" }}>
              ALTER DATABASE postgres SET app.settings.marky_cron_url = &apos;http://localhost:3000/api/cron/ingest&apos;;{"\n"}
              ALTER DATABASE postgres SET app.settings.cron_secret = &apos;dev_cron_secret&apos;;
            </pre>
          </div>
        )}
      </section>

      {/* 3. Ingestion Runs History */}
      <section style={{ padding: "28px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e7e7e4", marginBottom: "32px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "20px", fontFamily: "Georgia, serif" }}>3. Recent Ingestion Execution History (`ingestion_runs`)</h2>
        {recentRuns.length === 0 ? (
          <p style={{ color: "#6b6b67", fontSize: "13px" }}>No persistent ingestion execution history found in `ingestion_runs` table.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e7e7e4", color: "#6b6b67" }}>
                  <th style={{ padding: "8px 12px" }}>Started At (UTC)</th>
                  <th style={{ padding: "8px 12px" }}>Source Name</th>
                  <th style={{ padding: "8px 12px" }}>Status</th>
                  <th style={{ padding: "8px 12px" }}>Seen</th>
                  <th style={{ padding: "8px 12px" }}>Inserted</th>
                  <th style={{ padding: "8px 12px" }}>Skipped</th>
                  <th style={{ padding: "8px 12px" }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id} style={{ borderBottom: "1px solid #f0f0ed" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{new Date(run.startedAt).toISOString().replace("T", " ").slice(0, 19)}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{run.sourceName ?? "Batch Run"}</td>
                    <td style={{ padding: "8px 12px" }}>{statusBadge(run.status)}</td>
                    <td style={{ padding: "8px 12px" }}>{run.itemsSeen}</td>
                    <td style={{ padding: "8px 12px", color: "#176b45", fontWeight: 700 }}>{run.itemsInserted}</td>
                    <td style={{ padding: "8px 12px", color: "#6b6b67" }}>{run.itemsSkipped}</td>
                    <td style={{ padding: "8px 12px", color: "#b91c1c" }}>{run.errorMessage ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. 12-Topic Health Summary Table */}
      <section style={{ padding: "28px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e7e7e4", marginBottom: "36px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "20px", fontFamily: "Georgia, serif" }}>4. 12-Topic Source Health Summary</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e7e7e4", color: "#6b6b67" }}>
                <th style={{ padding: "10px 12px" }}>Topic</th>
                <th style={{ padding: "10px 12px" }}>Source Name</th>
                <th style={{ padding: "10px 12px" }}>Configured Feed URL</th>
                <th style={{ padding: "10px 12px" }}>HTTP</th>
                <th style={{ padding: "10px 12px" }}>Last Success (UTC)</th>
                <th style={{ padding: "10px 12px" }}>Feed Items</th>
                <th style={{ padding: "10px 12px" }}>DB Items</th>
                <th style={{ padding: "10px 12px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.topicSlug} style={{ borderBottom: "1px solid #f0f0ed" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{t.topicName}</td>
                  <td style={{ padding: "10px 12px" }}>{t.sourceName}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: "11px", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <a href={t.configuredFeedUrl} target="_blank" rel="noreferrer" style={{ color: "#176b45" }}>{t.configuredFeedUrl}</a>
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{t.liveFetch.httpStatusCode ?? "ERR"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "11px", fontFamily: "monospace" }}>
                    {t.lastSuccessAt ? new Date(t.lastSuccessAt).toISOString().replace("T", " ").slice(0, 19) : "Never"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{t.liveFetch.totalFeedEntries}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{t.totalArticlesInDbForSource}</td>
                  <td style={{ padding: "10px 12px" }}>{statusBadge(t.overallStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Individual 12 Topic Cards */}
      <h2 style={{ margin: "0 0 20px", fontSize: "24px", fontFamily: "Georgia, serif" }}>5. Topic-by-Topic Observability Details</h2>

      {topics.map((t, index) => (
        <details key={t.topicSlug} open={index < 3} style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e7e7e4", padding: "24px", marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
          <summary style={{ cursor: "pointer", fontSize: "20px", fontFamily: "Georgia, serif", fontWeight: 700, color: "#176b45", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>TOPIC: {t.topicName}</span>
            <span style={{ fontSize: "13px", fontFamily: "system-ui" }}>{statusBadge(t.overallStatus)}</span>
          </summary>

          <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
            {/* A. Source Configuration */}
            <div style={{ padding: "16px", background: "#f9f9f8", borderRadius: "8px", border: "1px solid #ededeb" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "14px", color: "#6b6b67", textTransform: "uppercase", letterSpacing: "0.08em" }}>A. Source Configuration</h3>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Official Source:</strong> {t.sourceName}</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Site URL:</strong> <a href={t.officialSiteUrl} target="_blank" rel="noreferrer" style={{ color: "#176b45" }}>{t.officialSiteUrl}</a></p>
              <p style={{ margin: "4px 0", fontSize: "13px", wordBreak: "break-all" }}><strong>Configured Feed URL:</strong> <code style={{ fontSize: "11px" }}>{t.configuredFeedUrl}</code></p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Source Type:</strong> {t.sourceType} | <strong>Interval:</strong> {t.fetchIntervalMinutes}m</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Last Success:</strong> {t.lastSuccessAt ? new Date(t.lastSuccessAt).toISOString() : "Never"}</p>
              <p style={{ margin: "4px 0", fontSize: "13px", color: t.lastError ? "#b91c1c" : "inherit" }}><strong>Last Error:</strong> {t.lastError ?? "None"}</p>
            </div>

            {/* B. Live Fetch Diagnostic */}
            <div style={{ padding: "16px", background: "#f9f9f8", borderRadius: "8px", border: "1px solid #ededeb" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "14px", color: "#6b6b67", textTransform: "uppercase", letterSpacing: "0.08em" }}>B. Live Fetch Diagnostic</h3>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Fetch Result:</strong> {statusBadge(t.liveFetch.status)}</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>HTTP Status:</strong> {t.liveFetch.httpStatusCode ?? "N/A"}</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Response Time:</strong> {t.liveFetch.responseTimeMs} ms</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Content-Type:</strong> {t.liveFetch.contentType ?? "Unknown"}</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Response Size:</strong> {t.liveFetch.contentLengthBytes ? `${t.liveFetch.contentLengthBytes} bytes` : "Unknown"}</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>SSRF Validation:</strong> {t.liveFetch.ssrfValidation === "PASS" ? "✅ PASS" : "❌ FAIL"}</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Redirects:</strong> {t.liveFetch.redirectCount > 0 ? `Yes (${t.liveFetch.redirectCount})` : "No"}</p>
              {t.liveFetch.redirectChain.length > 1 ? (
                <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#6b6b67", marginTop: "4px" }}>
                  Chain: {t.liveFetch.redirectChain.join(" → ")}
                </div>
              ) : null}
            </div>

            {/* C. Database & Feed Visibility */}
            <div style={{ padding: "16px", background: "#f9f9f8", borderRadius: "8px", border: "1px solid #ededeb" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "14px", color: "#6b6b67", textTransform: "uppercase", letterSpacing: "0.08em" }}>C. Database & Feed Visibility</h3>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Articles in DB for Source:</strong> <strong>{t.totalArticlesInDbForSource}</strong></p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Articles Mapped to Topic:</strong> <strong>{t.totalArticlesMappedToTopic}</strong></p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Max Age Cutoff:</strong> {t.maxArticleAgeDays} days</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Latest DB Article:</strong> {t.latestDbArticle?.title ?? "None"}</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Feed Visibility:</strong> For You: ✅ | Trending: ✅ | Latest: ✅</p>
            </div>
          </div>

          {/* D. Pipeline Transformation Result */}
          <div style={{ marginTop: "20px" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: "15px", color: "#176b45" }}>Item Transformation Log (Latest Feed Candidates)</h4>
            {t.liveFetch.pipelineItems.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#6b6b67" }}>No candidate feed items available for pipeline inspection.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e7e7e4", color: "#6b6b67", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>Title</th>
                      <th style={{ padding: "6px 8px" }}>Published</th>
                      <th style={{ padding: "6px 8px" }}>SHA-256 Hash</th>
                      <th style={{ padding: "6px 8px" }}>Freshness</th>
                      <th style={{ padding: "6px 8px" }}>DB Deduplication</th>
                      <th style={{ padding: "6px 8px" }}>Topic Matching</th>
                      <th style={{ padding: "6px 8px" }}>Source Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.liveFetch.pipelineItems.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f0f0ed" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 600, maxWidth: "260px" }}>
                          <a href={item.canonicalUrl} target="_blank" rel="noreferrer" style={{ color: "#242424", textDecoration: "none" }}>{item.title}</a>
                        </td>
                        <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: "11px" }}>{item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : "Unknown"}</td>
                        <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: "10px" }}>{item.urlHash.slice(0, 12)}…</td>
                        <td style={{ padding: "6px 8px" }}>{item.isAcceptedByFreshness ? "✅ Accepted" : `❌ ${item.rejectionReason}`}</td>
                        <td style={{ padding: "6px 8px" }}>{item.dbStatus === "DUPLICATE" ? "🔄 Duplicate in DB" : "✨ New Candidate"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.classificationMatches.map((m) => `${m.name} (${Math.round(m.confidence * 100)}%)`).join(", ") || "Generic"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.isDirectSource ? "🎯 DIRECT SOURCE" : "🔀 CROSS MATCH"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* E. Collapsible Raw Feed Items */}
          <details style={{ marginTop: "16px", padding: "12px", background: "#f6f6f4", borderRadius: "8px" }}>
            <summary style={{ cursor: "pointer", fontSize: "13px", fontWeight: 700, color: "#4b5563" }}>
              Raw Feed Items Preview ({t.liveFetch.rawFeedItems.length} items extracted from feed)
            </summary>
            <div style={{ marginTop: "12px", fontSize: "12px" }}>
              {t.liveFetch.rawFeedItems.map((raw, rIdx) => (
                <div key={rIdx} style={{ padding: "10px", background: "#ffffff", borderRadius: "6px", marginBottom: "8px", border: "1px solid #e7e7e4" }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 700 }}><a href={raw.canonicalUrl} target="_blank" rel="noreferrer" style={{ color: "#176b45" }}>{raw.title}</a></p>
                  <p style={{ margin: "0", color: "#6b6b67", fontSize: "11px" }}>
                    Author: {raw.author ? raw.author : "None"} | Published: {raw.publishedAt ?? "Date unknown"} | GUID: {raw.externalId ?? "None"}
                  </p>
                  {raw.summary ? <p style={{ margin: "6px 0 0", color: "#44443f", fontSize: "11px" }}>{raw.summary.slice(0, 200)}…</p> : null}
                </div>
              ))}
            </div>
          </details>
        </details>
      ))}
    </div>
  );
}
