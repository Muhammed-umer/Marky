import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyContent } from "@/lib/ingestion/classify";
import { fetchWebMetadata } from "@/lib/ingestion/web";
import type { FeedItem, Interest } from "@/lib/types";
import { urlHash } from "@/lib/url";

const queueMessageSchema = z.object({ submissionId: z.string().uuid(), profileId: z.string().uuid(), url: z.string().url().max(2048), note: z.string().max(2000).nullable() });
interface QueueMessageRow { msg_id: number; read_ct: number; message: unknown }

function errorCode(error: unknown) {
  return error instanceof Error && /^[A-Z0-9_:-]{2,80}$/.test(error.message) ? error.message : "LINK_PROCESSING_FAILED";
}

export async function enqueueLinkSubmission(client: SupabaseClient, profileId: string, url: string, note?: string) {
  const { data: submission, error } = await client.from("link_submissions").insert({ user_id: profileId, submitted_url: url, note: note || null, status: "queued" }).select("id").single();
  if (error || !submission) throw new Error("SUBMISSION_CREATE_FAILED");
  const { error: queueError } = await client.rpc("enqueue_link_ingestion", { message: { submissionId: submission.id, profileId, url, note: note || null } });
  if (queueError) {
    await client.from("link_submissions").update({ status: "failed", error_code: "QUEUE_SEND_FAILED", updated_at: new Date().toISOString() }).eq("id", submission.id);
    throw new Error("QUEUE_SEND_FAILED");
  }
  return submission.id as string;
}

async function persistArticle(client: SupabaseClient, message: z.infer<typeof queueMessageSchema>): Promise<FeedItem> {
  const metadata = await fetchWebMetadata(message.url);
  const host = new URL(metadata.canonicalUrl).hostname.replace(/^www\./, "");
  const matches = classifyContent(metadata.title, metadata.summary, host);
  const hash = urlHash(metadata.canonicalUrl);
  const { data: existing, error: lookupError } = await client.from("content_items").select("id").eq("url_hash", hash).maybeSingle();
  if (lookupError) throw new Error("ITEM_LOOKUP_FAILED");
  const values = { canonical_url: metadata.canonicalUrl, url_hash: hash, title: metadata.title, author: metadata.author, summary: metadata.summary, published_at: metadata.publishedAt, publication_time_status: metadata.publishedAt ? "known" : "unknown" };
  const result = existing
    ? await client.from("content_items").update(values).eq("id", existing.id).select("id").single()
    : await client.from("content_items").insert(values).select("id").single();
  if (result.error || !result.data) throw new Error("ITEM_SAVE_FAILED");
  const contentItemId = result.data.id as string;
  if (matches.length) {
    const { data: rows, error } = await client.from("interests").select("id,name").in("name", matches.map((match) => match.name));
    if (error) throw new Error("INTEREST_LOOKUP_FAILED");
    const links = (rows ?? []).map((interest) => ({ content_item_id: contentItemId, interest_id: interest.id, confidence: matches.find((match) => match.name === interest.name)?.confidence ?? 0.55 }));
    if (links.length) {
      const { error: linkError } = await client.from("content_item_interests").upsert(links, { onConflict: "content_item_id,interest_id" });
      if (linkError) throw new Error("INTEREST_SAVE_FAILED");
    }
  }
  const { error: savedError } = await client.from("saved_items").upsert({ user_id: message.profileId, content_item_id: contentItemId, note: message.note }, { onConflict: "user_id,content_item_id" });
  if (savedError) throw new Error("SAVED_ITEM_FAILED");
  return { id: contentItemId, title: metadata.title, excerpt: metadata.summary ?? "Open the original source to read this story.", url: metadata.canonicalUrl, source: host, author: metadata.author ?? "Unknown author", publishedAt: metadata.publishedAt, imageUrl: null, engagementCount: 0, interests: (matches.length ? matches.map((match) => match.name) : ["Developer Tools"]) as Interest[], sourceCount: 1, saved: true, read: false, explanation: ["Added by you"] };
}

export async function processLinkQueue(client: SupabaseClient, batchSize = 3) {
  const { data, error } = await client.rpc("dequeue_link_ingestion", { batch_size: batchSize });
  if (error) throw new Error("QUEUE_READ_FAILED");
  const messages = (data ?? []) as QueueMessageRow[];
  for (const queued of messages) {
    const parsed = queueMessageSchema.safeParse(queued.message);
    if (!parsed.success) { await client.rpc("delete_link_ingestion", { message_id: queued.msg_id }); continue; }
    const job = parsed.data;
    try {
      await client.from("link_submissions").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.submissionId).eq("user_id", job.profileId);
      const item = await persistArticle(client, job);
      await client.from("link_submissions").update({ status: "completed", content_item_id: item.id, result_item: item, error_code: null, updated_at: new Date().toISOString() }).eq("id", job.submissionId).eq("user_id", job.profileId);
    } catch (processingError) {
      await client.from("link_submissions").update({ status: "failed", error_code: errorCode(processingError), updated_at: new Date().toISOString() }).eq("id", job.submissionId).eq("user_id", job.profileId);
    } finally {
      await client.rpc("delete_link_ingestion", { message_id: queued.msg_id });
    }
  }
  return messages.length;
}
