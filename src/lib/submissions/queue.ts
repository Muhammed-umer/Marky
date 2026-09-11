import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyContent } from "@/lib/ingestion/classify";
import { resolveConflictingItem } from "@/lib/ingestion/conflict";
import { fetchWebMetadata } from "@/lib/ingestion/web";
import type { FeedItem, Interest } from "@/lib/types";
import { isValidAuthor } from "@/lib/types";
import { urlHash } from "@/lib/url";

interface StoredItemRow {
  id: string;
  title: string;
  author: string | null;
  summary: string | null;
  body_content: string | null;
  image_url: string | null;
  published_at: string | null;
}

const queueMessageSchema = z.object({
  submissionId: z.string().uuid(),
  profileId: z.string().uuid(),
  url: z.string().url().max(2048),
  note: z.string().max(2000).nullable(),
});
interface QueueMessageRow {
  msg_id: number;
  read_ct: number;
  message: unknown;
}

function errorCode(error: unknown) {
  return error instanceof Error && /^[A-Z0-9_:-]{2,80}$/.test(error.message) ? error.message : "LINK_PROCESSING_FAILED";
}

export async function enqueueLinkSubmission(client: SupabaseClient, profileId: string, url: string, note?: string) {
  const { data: submission, error } = await client
    .from("user_submissions")
    .insert({ user_id: profileId, submitted_url: url, note: note || null, status: "queued", submitted_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !submission) throw new Error("SUBMISSION_CREATE_FAILED");
  const { error: queueError } = await client.rpc("enqueue_link_ingestion", {
    message: { submissionId: submission.id, profileId, url, note: note || null },
  });
  if (queueError) {
    await client
      .from("user_submissions")
      .update({ status: "failed", error_message: "QUEUE_SEND_FAILED", processed_at: new Date().toISOString() })
      .eq("id", submission.id);
    throw new Error("QUEUE_SEND_FAILED");
  }
  return submission.id as string;
}

async function persistArticle(client: SupabaseClient, message: z.infer<typeof queueMessageSchema>): Promise<FeedItem> {
  const metadata = await fetchWebMetadata(message.url);
  const host = new URL(metadata.canonicalUrl).hostname.replace(/^www\./, "");
  const matches = classifyContent(metadata.title, metadata.summary, metadata.bodyText);
  const hash = urlHash(metadata.canonicalUrl);
  const { data: existingRow, error: lookupError } = await client
    .from("content_items")
    .select("id,title,author,summary,body_content,image_url,published_at")
    .eq("url_hash", hash)
    .maybeSingle();
  if (lookupError) throw new Error("ITEM_LOOKUP_FAILED");
  const existing = (existingRow ?? null) as StoredItemRow | null;

  // A row every reader sees is shared state. When the article is already
  // stored -- from a feed, usually with the publisher's own image and date --
  // the page fetch only fills gaps; it never replaces what is there with
  // whatever this fetch happened to return, null included. Body text is the
  // one exception: the longer of the two wins, as in the ingest enrichment.
  // Compared by character rather than by word, because the word tokenizer is
  // ASCII-only and a reader's submitted article may be in any script.
  const storedBody = existing?.body_content ?? null;
  const bodyText = (metadata.bodyText ?? "").length > (storedBody ?? "").length ? metadata.bodyText : storedBody;
  const merged = {
    title: existing?.title ?? metadata.title,
    author: existing?.author ?? metadata.author,
    summary: existing?.summary ?? metadata.summary,
    body_content: bodyText,
    image_url: existing?.image_url ?? metadata.imageUrl,
    published_at: existing?.published_at ?? metadata.publishedAt,
  };
  const now = new Date().toISOString();
  let contentItemId: string;
  if (existing) {
    const { data, error } = await client.from("content_items").update({ ...merged, updated_at: now }).eq("id", existing.id).select("id").single();
    if (error || !data) throw new Error("ITEM_SAVE_FAILED");
    contentItemId = data.id as string;
  } else {
    const { data, error } = await client
      .from("content_items")
      .insert({ ...merged, canonical_url: metadata.canonicalUrl, url_hash: hash, fetched_at: now, updated_at: now })
      .select("id")
      .single();
    if (error?.code === "23505") {
      // Stored under an older URL form whose dedupe_key matches, or by a
      // concurrent worker. The article exists; the reader's save still has
      // to be written, so resolve the row rather than failing the submission.
      const resolved = await resolveConflictingItem(client, hash, metadata.canonicalUrl);
      if (!resolved) throw new Error("ITEM_SAVE_FAILED");
      contentItemId = resolved;
    } else if (error || !data) {
      throw new Error("ITEM_SAVE_FAILED");
    } else {
      contentItemId = data.id as string;
    }
  }
  if (matches.length) {
    const { data: rows, error } = await client.from("topics").select("id,name").in("name", matches.map((match) => match.name));
    if (error) throw new Error("TOPIC_LOOKUP_FAILED");
    const links = (rows ?? []).map((topic) => ({ content_item_id: contentItemId, topic_id: topic.id }));
    if (links.length) {
      const { error: linkError } = await client.from("content_item_topics").upsert(links, { onConflict: "content_item_id,topic_id" });
      if (linkError) throw new Error("TOPIC_SAVE_FAILED");
    }
  }
  const { error: savedError } = await client.from("saved_items").upsert({ user_id: message.profileId, content_item_id: contentItemId }, { onConflict: "user_id,content_item_id" });
  if (savedError) throw new Error("SAVED_ITEM_FAILED");
  return {
    id: contentItemId,
    title: merged.title,
    excerpt: merged.summary ?? "Open the original source to read this story.",
    url: metadata.canonicalUrl,
    source: host,
    author: merged.author && isValidAuthor(merged.author) ? merged.author : null,
    publishedAt: merged.published_at,
    imageUrl: merged.image_url,
    engagementCount: 0,
    interests: matches.map((match) => match.name) as Interest[],
    sourceCount: 1,
    saved: true,
    read: false,
    explanation: ["Added by you"],
  };
}

export async function processLinkQueue(client: SupabaseClient, batchSize = 3) {
  const { data, error } = await client.rpc("dequeue_link_ingestion", { batch_size: batchSize });
  if (error) throw new Error("QUEUE_READ_FAILED");
  const messages = (data ?? []) as QueueMessageRow[];
  for (const queued of messages) {
    const parsed = queueMessageSchema.safeParse(queued.message);
    if (!parsed.success) {
      await client.rpc("delete_link_ingestion", { message_id: queued.msg_id });
      continue;
    }
    const job = parsed.data;
    try {
      await client
        .from("user_submissions")
        .update({ status: "processing" })
        .eq("id", job.submissionId)
        .eq("user_id", job.profileId);
      const item = await persistArticle(client, job);
      await client
        .from("user_submissions")
        .update({ status: "completed", content_item_id: item.id, error_message: null, processed_at: new Date().toISOString() })
        .eq("id", job.submissionId)
        .eq("user_id", job.profileId);
    } catch (processingError) {
      await client
        .from("user_submissions")
        .update({ status: "failed", error_message: errorCode(processingError), processed_at: new Date().toISOString() })
        .eq("id", job.submissionId)
        .eq("user_id", job.profileId);
    } finally {
      await client.rpc("delete_link_ingestion", { message_id: queued.msg_id });
    }
  }
  return messages.length;
}
