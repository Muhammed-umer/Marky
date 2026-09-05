import { classifyContent } from "@/lib/ingestion/classify";
import { assertPublicHttpUrl } from "@/lib/ingestion/network";
import { parseRssFeed, type RssCandidate } from "@/lib/ingestion/rss";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { urlHash } from "@/lib/url";

export interface ItemPipelineResult {
  title: string;
  originalUrl: string;
  canonicalUrl: string;
  urlHash: string;
  author: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  summary: string | null;
  isAcceptedByFreshness: boolean;
  rejectionReason: string | null;
  dbStatus: "DUPLICATE" | "NEW_CANDIDATE";
  existingContentItemId?: string;
  classificationMatches: Array<{ name: string; confidence: number }>;
  isDirectSource: boolean;
  feedAvailability: { forYou: boolean; trending: boolean; latest: boolean };
}

export interface LiveFetchDiagnostic {
  status: "SUCCESS" | "FAILED" | "TIMEOUT" | "INVALID_URL";
  httpStatusCode: number | null;
  finalUrl: string | null;
  redirectCount: number;
  redirectChain: string[];
  responseTimeMs: number;
  contentType: string | null;
  etagHeader: string | null;
  lastModifiedHeader: string | null;
  contentLengthBytes: number | null;
  ssrfValidation: "PASS" | "FAIL";
  fetchError: string | null;
  rawFeedItems: RssCandidate[];
  totalFeedEntries: number;
  itemsAccepted: number;
  itemsRejected: number;
  rejectionReasons: Record<string, number>;
  newestFeedEntry: RssCandidate | null;
  oldestFeedEntry: RssCandidate | null;
  pipelineItems: ItemPipelineResult[];
}

export interface TopicAuditData {
  topicName: string;
  topicSlug: string;
  topicId: string;
  sourceId: string | null;
  sourceName: string;
  officialSiteUrl: string;
  configuredFeedUrl: string;
  sourceType: string;
  isActive: boolean;
  fetchIntervalMinutes: number;
  etag: string | null;
  lastModified: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  maxArticleAgeDays: number;
  totalArticlesInDbForSource: number;
  totalArticlesMappedToTopic: number;
  latestDbArticle: { title: string; publishedAt: string | null; url: string; fetchedAt: string } | null;
  oldestDbArticle: { title: string; publishedAt: string | null; url: string; fetchedAt: string } | null;
  overallStatus: "HEALTHY" | "WARNING" | "FAILED" | "STALE" | "NO DATA";
  liveFetch: LiveFetchDiagnostic;
}

export interface SupabaseCronStatus {
  jobid?: number;
  schedule?: string;
  command?: string;
  active?: boolean;
  jobname?: string;
  isConfigured: boolean;
}

export interface SchedulerAuditData {
  triggerEndpoint: string;
  authentication: string;
  supabasePgCron: SupabaseCronStatus | string;
  vercelCron: "NOT CONFIGURED";
  httpCronTrigger: "ACTIVE";
  dueRule: string;
  concurrencyLimit: number;
  environmentUrl: string;
}

export interface IngestionRunRecord {
  id: string;
  sourceId: string | null;
  sourceName?: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  itemsSeen: number;
  itemsInserted: number;
  itemsSkipped: number;
  errorCount: number;
  errorMessage: string | null;
}

const FETCH_TIMEOUT_MS = 10_000;

async function performLiveFetchDiagnostic(
  configuredFeedUrl: string,
  sourceName: string,
  topicName: string,
  maxAgeDays: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  topicId: string,
): Promise<LiveFetchDiagnostic> {
  const startTime = Date.now();
  const redirectChain: string[] = [configuredFeedUrl];
  let currentUrl = configuredFeedUrl;
  let redirectCount = 0;

  try {
    const safeUrl = await assertPublicHttpUrl(configuredFeedUrl);
    currentUrl = safeUrl.toString();

    const headers = new Headers({
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
      "User-Agent": "MarkyTechnologyReader/1.0 (+https://marky.app)",
    });

    let response = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    while (response.status >= 300 && response.status < 400 && redirectCount < 3) {
      const location = response.headers.get("location");
      if (!location) break;
      const nextUrl = new URL(location, currentUrl).toString();
      const safeNext = await assertPublicHttpUrl(nextUrl);
      currentUrl = safeNext.toString();
      redirectChain.push(currentUrl);
      redirectCount += 1;
      response = await fetch(currentUrl, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
    }

    const responseTimeMs = Date.now() - startTime;
    const contentType = response.headers.get("content-type");
    const etagHeader = response.headers.get("etag");
    const lastModifiedHeader = response.headers.get("last-modified");
    const contentLengthBytes = Number(response.headers.get("content-length")) || null;

    if (!response.ok && response.status !== 304) {
      return {
        status: "FAILED",
        httpStatusCode: response.status,
        finalUrl: currentUrl,
        redirectCount,
        redirectChain,
        responseTimeMs,
        contentType,
        etagHeader,
        lastModifiedHeader,
        contentLengthBytes,
        ssrfValidation: "PASS",
        fetchError: `HTTP_${response.status}`,
        rawFeedItems: [],
        totalFeedEntries: 0,
        itemsAccepted: 0,
        itemsRejected: 0,
        rejectionReasons: {},
        newestFeedEntry: null,
        oldestFeedEntry: null,
        pipelineItems: [],
      };
    }

    const xml = await response.text();
    const parsedCandidates = parseRssFeed(xml);
    const cutoff = Date.now() - maxAgeDays * 86_400_000;

    let itemsAccepted = 0;
    let itemsRejected = 0;
    const rejectionReasons: Record<string, number> = {};

    const pipelineItems: ItemPipelineResult[] = [];

    for (const candidate of parsedCandidates.slice(0, 10)) {
      const publishedMs = candidate.publishedAt ? Date.parse(candidate.publishedAt) : Number.NaN;
      const isAccepted = !Number.isNaN(publishedMs) && publishedMs >= cutoff;
      let rejectionReason: string | null = null;

      if (!candidate.publishedAt) {
        rejectionReason = "Missing publication date";
      } else if (Number.isNaN(publishedMs)) {
        rejectionReason = "Invalid publication date format";
      } else if (publishedMs < cutoff) {
        rejectionReason = `Older than ${maxAgeDays}-day cutoff`;
      }

      if (isAccepted) {
        itemsAccepted += 1;
      } else {
        itemsRejected += 1;
        if (rejectionReason) {
          rejectionReasons[rejectionReason] = (rejectionReasons[rejectionReason] ?? 0) + 1;
        }
      }

      const hash = urlHash(candidate.canonicalUrl);
      const { data: existing } = await admin.from("content_items").select("id").eq("url_hash", hash).maybeSingle();

      const classificationMatches = classifyContent(candidate.title, candidate.summary, sourceName);
      const isDirectSource = classificationMatches.some((m) => m.name === topicName) || sourceName.toLowerCase().includes(topicName.toLowerCase());

      // Check feed availability
      let forYou = false;
      let trending = false;
      let latest = false;

      if (existing?.id) {
        const { data: mappedTopic } = await admin
          .from("content_item_topics")
          .select("topic_id")
          .eq("content_item_id", existing.id)
          .eq("topic_id", topicId)
          .maybeSingle();

        if (mappedTopic) {
          latest = true;
          forYou = true;
          trending = true;
        }
      }

      pipelineItems.push({
        title: candidate.title,
        originalUrl: candidate.canonicalUrl,
        canonicalUrl: candidate.canonicalUrl,
        urlHash: hash,
        author: candidate.author,
        publishedAt: candidate.publishedAt,
        imageUrl: candidate.imageUrl,
        summary: candidate.summary,
        isAcceptedByFreshness: isAccepted,
        rejectionReason,
        dbStatus: existing?.id ? "DUPLICATE" : "NEW_CANDIDATE",
        existingContentItemId: existing?.id,
        classificationMatches,
        isDirectSource,
        feedAvailability: { forYou, trending, latest },
      });
    }

    const sortedByDate = [...parsedCandidates].filter((c) => c.publishedAt).sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));

    return {
      status: "SUCCESS",
      httpStatusCode: response.status,
      finalUrl: currentUrl,
      redirectCount,
      redirectChain,
      responseTimeMs,
      contentType,
      etagHeader,
      lastModifiedHeader,
      contentLengthBytes: contentLengthBytes ?? Buffer.byteLength(xml, "utf8"),
      ssrfValidation: "PASS",
      fetchError: null,
      rawFeedItems: parsedCandidates.slice(0, 10),
      totalFeedEntries: parsedCandidates.length,
      itemsAccepted,
      itemsRejected,
      rejectionReasons,
      newestFeedEntry: sortedByDate[0] ?? null,
      oldestFeedEntry: sortedByDate[sortedByDate.length - 1] ?? null,
      pipelineItems,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "FETCH_FAILED";
    return {
      status: errorMsg.includes("TIMEOUT") ? "TIMEOUT" : errorMsg.includes("INVALID") ? "INVALID_URL" : "FAILED",
      httpStatusCode: null,
      finalUrl: currentUrl,
      redirectCount,
      redirectChain,
      responseTimeMs: Date.now() - startTime,
      contentType: null,
      etagHeader: null,
      lastModifiedHeader: null,
      contentLengthBytes: null,
      ssrfValidation: errorMsg.includes("UNSAFE") ? "FAIL" : "PASS",
      fetchError: errorMsg,
      rawFeedItems: [],
      totalFeedEntries: 0,
      itemsAccepted: 0,
      itemsRejected: 0,
      rejectionReasons: {},
      newestFeedEntry: null,
      oldestFeedEntry: null,
      pipelineItems: [],
    };
  }
}

export async function getIngestionAuditData(): Promise<{
  scheduler: SchedulerAuditData;
  recentRuns: IngestionRunRecord[];
  topics: TopicAuditData[];
}> {
  const admin = createAdminSupabaseClient();
  const lowFrequencySources = new Set(["React Blog", "TypeScript Blog"]);

  let pgCronStatus: SupabaseCronStatus | string = "NOT CONFIGURED / PENDING MIGRATION";

  if (admin) {
    try {
      const { data: cronData, error: cronErr } = await admin.rpc("get_ingestion_cron_status");
      if (!cronErr && cronData && Array.isArray(cronData) && cronData.length > 0) {
        pgCronStatus = {
          jobid: cronData[0].jobid,
          schedule: cronData[0].schedule,
          command: cronData[0].command,
          active: cronData[0].active,
          jobname: cronData[0].jobname,
          isConfigured: true,
        };
      }
    } catch {
      // RPC might not be installed yet
    }
  }

  const scheduler: SchedulerAuditData = {
    triggerEndpoint: "/api/cron/ingest",
    authentication: "CRON_SECRET (Bearer Token in Authorization header)",
    supabasePgCron: pgCronStatus,
    vercelCron: "NOT CONFIGURED",
    httpCronTrigger: "ACTIVE",
    dueRule: "last_success_at or last_fetched_at is null OR Date.now() - lastFetch >= fetch_interval_minutes * 60,000",
    concurrencyLimit: 4,
    environmentUrl: process.env.MARKY_CRON_URL ?? "http://localhost:3000/api/cron/ingest",
  };

  if (!admin) {
    return { scheduler, recentRuns: [], topics: [] };
  }

  // Fetch ingestion runs
  const { data: rawRuns } = await admin
    .from("ingestion_runs")
    .select("id, source_id, started_at, completed_at, status, items_seen, items_inserted, items_skipped, error_count, error_message, source:sources(name)")
    .order("started_at", { ascending: false })
    .limit(20);

  const recentRuns: IngestionRunRecord[] = (rawRuns ?? []).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceName: Array.isArray(row.source) ? row.source[0]?.name : (row.source as { name: string } | undefined)?.name,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    itemsSeen: row.items_seen ?? 0,
    itemsInserted: row.items_inserted ?? 0,
    itemsSkipped: row.items_skipped ?? 0,
    errorCount: row.error_count ?? 0,
    errorMessage: row.error_message,
  }));

  // Fetch topics and sources
  const [{ data: topicsRows }, { data: sourcesRows }] = await Promise.all([
    admin.from("topics").select("id, name, slug").order("name"),
    admin.from("sources").select("*").order("name"),
  ]);

  const sourcesList = sourcesRows ?? [];
  const topicsList = topicsRows ?? [];

  const topicAudits: TopicAuditData[] = [];

  for (const topic of topicsList) {
    const matchingSource = sourcesList.find((s) => {
      const srcName = s.name.toLowerCase();
      const topName = topic.name.toLowerCase();
      if (topName === "google / google deepmind") return srcName.includes("google");
      if (topName === "next.js") return srcName.includes("next");
      return srcName.includes(topName);
    });

    const source = matchingSource ?? {
      id: null,
      name: `${topic.name} Source`,
      site_url: "https://marky.app",
      feed_url: "",
      source_type: "rss",
      is_active: false,
      fetch_interval_minutes: 30,
      etag: null,
      last_modified: null,
      last_fetched_at: null,
      last_success_at: null,
      last_error: "Source not configured",
    };

    const maxAgeDays = lowFrequencySources.has(source.name) ? 365 : 30;

    let dbSourceItemCount = 0;
    let dbTopicItemCount = 0;
    let latestDbArticle = null;
    let oldestDbArticle = null;

    if (source.id) {
      const [{ count: sCount }, { count: tCount }, { data: latestRes }, { data: oldestRes }] = await Promise.all([
        admin.from("content_items").select("*", { count: "exact", head: true }).eq("source_id", source.id),
        admin.from("content_item_topics").select("*", { count: "exact", head: true }).eq("topic_id", topic.id),
        admin
          .from("content_items")
          .select("title, published_at, canonical_url, fetched_at")
          .eq("source_id", source.id)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(1),
        admin
          .from("content_items")
          .select("title, published_at, canonical_url, fetched_at")
          .eq("source_id", source.id)
          .order("published_at", { ascending: true, nullsFirst: false })
          .limit(1),
      ]);

      dbSourceItemCount = sCount ?? 0;
      dbTopicItemCount = tCount ?? 0;

      if (latestRes && latestRes[0]) {
        latestDbArticle = {
          title: latestRes[0].title,
          publishedAt: latestRes[0].published_at,
          url: latestRes[0].canonical_url,
          fetchedAt: latestRes[0].fetched_at,
        };
      }

      if (oldestRes && oldestRes[0]) {
        oldestDbArticle = {
          title: oldestRes[0].title,
          publishedAt: oldestRes[0].published_at,
          url: oldestRes[0].canonical_url,
          fetchedAt: oldestRes[0].fetched_at,
        };
      }
    }

    const liveFetch = source.feed_url
      ? await performLiveFetchDiagnostic(source.feed_url, source.name, topic.name, maxAgeDays, admin, topic.id)
      : {
          status: "FAILED" as const,
          httpStatusCode: null,
          finalUrl: null,
          redirectCount: 0,
          redirectChain: [],
          responseTimeMs: 0,
          contentType: null,
          etagHeader: null,
          lastModifiedHeader: null,
          contentLengthBytes: null,
          ssrfValidation: "FAIL" as const,
          fetchError: "NO_FEED_URL",
          rawFeedItems: [],
          totalFeedEntries: 0,
          itemsAccepted: 0,
          itemsRejected: 0,
          rejectionReasons: {},
          newestFeedEntry: null,
          oldestFeedEntry: null,
          pipelineItems: [],
        };

    let overallStatus: "HEALTHY" | "WARNING" | "FAILED" | "STALE" | "NO DATA" = "HEALTHY";
    if (liveFetch.status === "FAILED" || source.last_error) {
      overallStatus = "FAILED";
    } else if (dbSourceItemCount === 0) {
      overallStatus = "NO DATA";
    } else if (source.last_success_at && Date.now() - Date.parse(source.last_success_at) > 7 * 86_400_000) {
      overallStatus = "STALE";
    } else if (liveFetch.itemsAccepted === 0) {
      overallStatus = "WARNING";
    }

    topicAudits.push({
      topicName: topic.name,
      topicSlug: topic.slug,
      topicId: topic.id,
      sourceId: source.id,
      sourceName: source.name,
      officialSiteUrl: source.site_url ?? source.feed_url,
      configuredFeedUrl: source.feed_url ?? "",
      sourceType: source.source_type ?? "rss",
      isActive: source.is_active ?? true,
      fetchIntervalMinutes: source.fetch_interval_minutes ?? 30,
      etag: source.etag,
      lastModified: source.last_modified,
      lastFetchedAt: source.last_fetched_at,
      lastSuccessAt: source.last_success_at,
      lastError: source.last_error,
      maxArticleAgeDays: maxAgeDays,
      totalArticlesInDbForSource: dbSourceItemCount,
      totalArticlesMappedToTopic: dbTopicItemCount,
      latestDbArticle,
      oldestDbArticle,
      overallStatus,
      liveFetch,
    });
  }

  return { scheduler, recentRuns, topics: topicAudits };
}
