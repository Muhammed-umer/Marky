"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Check, ExternalLink, Menu, Plus, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { interests, type FeedItem, type FeedView, type Interest } from "@/lib/types";
import { rankItems } from "@/lib/ranking";
import { AuthControls } from "@/components/auth-controls";

const viewCopy: Record<FeedView, { title: string; subtitle: string }> = {
  "for-you": { title: "For you", subtitle: "A thoughtful mix shaped by your interests." },
  trending: { title: "Trending", subtitle: "Recent stories appearing across independent sources." },
  latest: { title: "Latest", subtitle: "New technology writing, ordered by publication time." },
};

export function MarkyApp({ initialItems, demoMode, authEnabled }: { initialItems: FeedItem[]; demoMode: boolean; authEnabled: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<FeedView>("for-you");
  const [interest, setInterest] = useState<Interest | "All Interests">("All Interests");
  const [savedOnly, setSavedOnly] = useState(false);
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [adding, setAdding] = useState(false);
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  useEffect(() => {
    if (demoMode) return;
    fetch(`/api/feed?view=${view}`)
      .then(async (response) => { if (!response.ok) throw new Error("Feed unavailable"); return response.json() as Promise<{ items?: FeedItem[] }>; })
      .then((payload) => { if (payload.items) setItems(payload.items); })
      .catch(() => setNotice("Sign in and configure Supabase to load your live feed."))
      .finally(() => setLoading(false));
  }, [demoMode, view]);
  const selected = interest === "All Interests" ? (["Artificial Intelligence", "Developer Tools", "Cybersecurity"] as Interest[]) : [interest];
  const visible = useMemo(() => rankItems(items, view, selected).filter((item) =>
    (interest === "All Interests" || item.interests.includes(interest)) &&
    (!savedOnly || item.saved) &&
    (readFilter === "all" || (readFilter === "read" ? item.read : !item.read))), [items, view, interest, savedOnly, readFilter]);

  const mutate = (id: string, field: "saved" | "read") => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: !item[field] } : item));

  function addLink(event: React.FormEvent) {
    event.preventDefault();
    try {
      const parsed = new URL(submittedUrl);
      if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error();
      setItems((current) => [{ id: crypto.randomUUID(), title: parsed.hostname.replace(/^www\./, ""), excerpt: "Metadata will be collected securely when cloud services are connected.", url: parsed.toString(), source: parsed.hostname, author: "Unknown author", publishedAt: null, interests: ["Developer Tools"], sourceCount: 1, saved: true, read: false, explanation: ["Publication date unavailable"] }, ...current]);
      setSubmittedUrl(""); setAdding(false); setNotice("Link saved to your reading queue.");
    } catch { setNotice("Enter a valid public HTTP or HTTPS link."); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="Marky home"><span>m</span>marky</a>
      <nav aria-label="Primary navigation">
        <a className="nav-item active" href="#feed"><Sparkles size={18} />Feed</a>
        <button className="nav-item" onClick={() => setSavedOnly(true)}><Bookmark size={18} />Saved</button>
        <button className="nav-item" onClick={() => setAdding(true)}><Plus size={18} />Add link</button>
      </nav>
      <div className="sidebar-foot"><div className="avatar">AK</div><div><strong>Your library</strong><span>{items.filter((item) => item.saved).length} saved reads</span></div></div>
    </aside>

    <main id="top">
      <header className="mobile-header"><a className="brand" href="#top"><span>m</span>marky</a><div className="mobile-actions">{authEnabled && <AuthControls />}<Menu aria-label="Open menu" /></div></header>
      {demoMode && <div className="demo-banner"><span>Demo workspace</span> Connect Clerk and Supabase to use live accounts and feeds.</div>}
      <section className="hero" id="feed">
        <p className="eyebrow">Your technology briefing</p>
        <div className="hero-row"><div><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].subtitle}</p></div><div className="hero-actions">{authEnabled && <AuthControls />}<button className="primary-button" onClick={() => setAdding(true)}><Plus size={17} /> Add link</button></div></div>
      </section>

      <section className="controls" aria-label="Feed controls">
        <div className="tabs" role="tablist">{(["for-you", "trending", "latest"] as FeedView[]).map((tab) => <button key={tab} role="tab" aria-selected={view === tab} className={view === tab ? "selected" : ""} onClick={() => setView(tab)}>{tab === "for-you" ? "For You" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        <div className="filter-row"><div className="interest-scroller"><button className={interest === "All Interests" ? "chip selected" : "chip"} onClick={() => setInterest("All Interests")}>All Interests</button>{interests.map((item) => <button className={interest === item ? "chip selected" : "chip"} key={item} onClick={() => setInterest(item)}>{item}</button>)}</div><select aria-label="Read state" value={readFilter} onChange={(event) => setReadFilter(event.target.value as typeof readFilter)}><option value="all">All items</option><option value="unread">Unread only</option><option value="read">Read only</option></select></div>
        {savedOnly && <button className="saved-filter" onClick={() => setSavedOnly(false)}>Saved only <X size={14} /></button>}
      </section>

      <section className="feed-list" aria-live="polite">
        {loading ? <div className="empty-state"><div className="skeleton card-skeleton" /><p>Loading your source-grounded feed…</p></div> : visible.length === 0 ? <div className="empty-state"><Search size={28} /><h2>No stories match these filters.</h2><p>Your choices are still here. Reset the filters to widen the feed.</p><button onClick={() => { setInterest("All Interests"); setSavedOnly(false); setReadFilter("all"); }}>Reset filters</button></div> : <AnimatePresence mode="popLayout">{visible.map((item) => <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={item.read ? "story read" : "story"} key={item.id}>
          <div className="story-meta"><span className="source-dot" />{item.source}<span>·</span><span>{item.publishedAt ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.publishedAt)) : "Date unknown"}</span></div>
          <a href={item.url} target="_blank" rel="noreferrer"><h2>{item.title}</h2></a><p className="excerpt">{item.excerpt}</p>
          <div className="labels">{item.explanation.map((label) => <span key={label}>{label}</span>)}</div>
          <footer><span>By {item.author}</span><div className="story-actions"><button aria-label={item.read ? "Mark unread" : "Mark read"} title={item.read ? "Mark unread" : "Mark read"} onClick={() => mutate(item.id, "read")} className={item.read ? "active" : ""}><Check size={17} /></button><button aria-label={item.saved ? "Unsave" : "Save"} title={item.saved ? "Unsave" : "Save"} onClick={() => mutate(item.id, "saved")} className={item.saved ? "active" : ""}><Bookmark size={17} fill={item.saved ? "currentColor" : "none"} /></button><a href={item.url} target="_blank" rel="noreferrer" aria-label="Open original"><ExternalLink size={17} /></a></div></footer>
        </motion.article>)}</AnimatePresence>}
      </section>
    </main>

    <AnimatePresence>{adding && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setAdding(false)}><motion.section role="dialog" aria-modal="true" aria-labelledby="add-title" className="modal" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setAdding(false)} aria-label="Close"><X /></button><p className="eyebrow">Keep it for later</p><h2 id="add-title">Add a useful link</h2><p>Paste a public article or X URL. Marky preserves the original source.</p><form onSubmit={addLink}><label htmlFor="url">Web address</label><input id="url" type="url" required placeholder="https://…" value={submittedUrl} onChange={(event) => setSubmittedUrl(event.target.value)} autoFocus /><label htmlFor="note">Note <span>optional</span></label><textarea id="note" placeholder="Why is this worth returning to?" /><button className="primary-button" type="submit">Save link</button></form></motion.section></motion.div>}</AnimatePresence>
    {notice && <button className="toast" onClick={() => setNotice(null)}>{notice}<X size={14} /></button>}
  </div>;
}
