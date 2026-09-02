"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useAuth, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { Bell, Bookmark, Check, Compass, ExternalLink, Heart, Home, Library, LoaderCircle, Mail, Menu, MessageCircle, PenLine, Plus, Search, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthControls } from "@/components/auth-controls";
import { rankItems } from "@/lib/ranking";
import { interests, type FeedItem, type FeedView, type Interest } from "@/lib/types";

const viewCopy: Record<FeedView, { label: string; title: string; subtitle: string }> = {
  "for-you": { label: "For you", title: "Your daily technology briefing", subtitle: "A focused mix from the topics and sources you care about." },
  trending: { label: "Trending", title: "What is earning attention", subtitle: "Important stories appearing across independent technology sources." },
  latest: { label: "Latest", title: "The newest useful reads", subtitle: "Fresh technology writing, with the newest publications first." },
};

function storyDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)) : "Date unknown";
}

function readingMinutes(item: FeedItem) {
  return Math.max(3, Math.min(9, Math.ceil((item.title.length + item.excerpt.length) / 85)));
}

function compactCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function ProfilePanel({ authEnabled, authLoaded, isSignedIn, user, items }: { authEnabled: boolean; authLoaded: boolean; isSignedIn: boolean; user: UserSummary | null; items: FeedItem[] }) {
  if (!authLoaded) return <div className="profile-loading" role="status"><span className="skeleton profile-avatar-skeleton" /><div><span className="skeleton skeleton-line title" /><span className="skeleton skeleton-line medium" /></div><span className="sr-only">Loading your profile…</span></div>;

  if (!isSignedIn) return <section className="profile-signin"><div className="profile-icon"><UserRound size={25} /></div><p className="section-kicker">Your Marky profile</p><h1>Sign in to see your profile</h1><p>Your saved articles, reading history, and account preferences will appear here.</p>{authEnabled ? <AuthControls /> : null}</section>;

  const savedCount = items.filter((item) => item.saved).length;
  const readCount = items.filter((item) => item.read).length;
  return <div className="profile-content">
    <section className="profile-heading"><p className="section-kicker">Your account</p><h1>Profile</h1><p>Manage your Marky identity and see how your reading library is growing.</p></section>
    <section className="profile-card profile-identity">
      <div className="profile-avatar">{user?.imageUrl ? <Image src={user.imageUrl} alt="" fill unoptimized sizes="72px" /> : <UserRound size={30} />}</div>
      <div><h2>{user?.name ?? "Marky reader"}</h2><p><Mail size={15} aria-hidden="true" />{user?.email}</p></div>
      <span className="profile-status"><ShieldCheck size={15} /> Signed in</span>
    </section>
    <section className="profile-grid" aria-label="Reading activity">
      <div className="profile-stat"><strong>{savedCount}</strong><span>Saved articles</span></div>
      <div className="profile-stat"><strong>{readCount}</strong><span>Articles read</span></div>
      <div className="profile-stat"><strong>{items.length}</strong><span>Stories available</span></div>
    </section>
    <section className="profile-card profile-preferences"><div><span className="profile-card-icon"><Sparkles size={18} /></span><h2>Reading preferences</h2><p>Marky uses your saves and reading activity to shape your personal briefing.</p></div><div className="profile-interest-list">{interests.slice(0, 6).map((item) => <span key={item}>{item}</span>)}</div></section>
    <section className="profile-card profile-account"><div><span className="profile-card-icon"><ShieldCheck size={18} /></span><h2>Account and security</h2><p>Use your avatar in the top-right corner to manage your Clerk account, password, and connected sign-in methods.</p></div></section>
  </div>;
}

type MarkyPage = "home" | "saved" | "profile";
type UserSummary = { name: string; email: string; imageUrl: string | null };
type MarkyAppProps = { initialItems: FeedItem[]; demoMode: boolean; authEnabled: boolean; initialPage?: MarkyPage };

export function MarkyApp(props: MarkyAppProps) {
  return props.authEnabled ? <AuthenticatedMarkyApp {...props} /> : <MarkyExperience {...props} authLoaded isSignedIn={false} userSummary={null} />;
}

function AuthenticatedMarkyApp(props: MarkyAppProps) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const userSummary = user ? {
    name: user.fullName ?? user.firstName ?? "Marky reader",
    email: user.primaryEmailAddress?.emailAddress ?? "No primary email",
    imageUrl: user.imageUrl ?? null,
  } : null;
  return <MarkyExperience {...props} authLoaded={authLoaded} isSignedIn={Boolean(isSignedIn)} userSummary={userSummary} />;
}

function MarkyExperience({ initialItems, demoMode, authEnabled, authLoaded, isSignedIn, userSummary, initialPage = "home" }: MarkyAppProps & { authLoaded: boolean; isSignedIn: boolean; userSummary: UserSummary | null }) {
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<FeedView>("for-you");
  const [interest, setInterest] = useState<Interest | "All Interests">("All Interests");
  const [query, setQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(initialPage === "saved");
  const [adding, setAdding] = useState(false);
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingLink, setSubmittingLink] = useState(false);
  const [pendingSubmissionIds, setPendingSubmissionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(!demoMode);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const seenItems = useRef(new Set<string>());

  const trackEvent = useCallback((contentItemId: string, eventType: "impression" | "open" | "save" | "unsave" | "mark_read" | "mark_unread") => {
    if (demoMode || !authLoaded || !isSignedIn) return;
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientEventId: crypto.randomUUID(), contentItemId, type: eventType }),
      keepalive: true,
    });
  }, [authLoaded, demoMode, isSignedIn]);

  useEffect(() => {
    if (demoMode) return;
    if (!authLoaded) return;
    if (!isSignedIn) return;
    const controller = new AbortController();
    fetch(`/api/feed?view=${view}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Feed unavailable");
        return response.json() as Promise<{ items?: FeedItem[] }>;
      })
      .then((payload) => { if (payload.items) setItems(payload.items); })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("Sign in to load your live briefing.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [authLoaded, demoMode, isSignedIn, view]);

  useEffect(() => {
    if (demoMode || pendingSubmissionIds.length === 0) return;
    let checking = false;
    const checkSubmissions = async () => {
      if (checking) return;
      checking = true;
      try {
        const statuses = await Promise.all(pendingSubmissionIds.map(async (id) => {
          const response = await fetch(`/api/submissions/${id}`, { cache: "no-store" });
          if (!response.ok) return { id, status: "pending" as const };
          const payload = await response.json() as { status: "queued" | "processing" | "completed" | "failed"; item?: FeedItem | null };
          return { id, ...payload };
        }));
        for (const result of statuses) {
          if (result.status === "completed" && result.item) {
            setItems((current) => [result.item!, ...current.filter((item) => item.id !== result.item!.id && item.url !== result.item!.url)]);
            setPendingSubmissionIds((current) => current.filter((id) => id !== result.id));
            setNotice(`“${result.item.title}” was added to Saved.`);
          } else if (result.status === "failed") {
            setPendingSubmissionIds((current) => current.filter((id) => id !== result.id));
            setNotice("Marky could not fetch that article. The site may block automated reading.");
          }
        }
      } finally {
        checking = false;
      }
    };
    void checkSubmissions();
    const interval = window.setInterval(() => void checkSubmissions(), 2_000);
    return () => window.clearInterval(interval);
  }, [demoMode, pendingSubmissionIds]);

  const visible = useMemo(() => {
    const selected = interest === "All Interests" ? (["Artificial Intelligence", "Developer Tools", "Cybersecurity"] as Interest[]) : [interest];
    const normalizedQuery = query.trim().toLowerCase();
    const orderedItems = demoMode ? rankItems(items, view, selected) : items;
    return orderedItems.filter((item) =>
      (interest === "All Interests" || item.interests.includes(interest)) &&
      (initialPage === "saved" ? item.saved : !item.saved) &&
      (!savedOnly || item.saved) &&
      (!normalizedQuery || `${item.title} ${item.excerpt} ${item.source} ${item.author}`.toLowerCase().includes(normalizedQuery)),
    );
  }, [demoMode, initialPage, items, view, interest, savedOnly, query]);

  const unreadCount = visible.filter((item) => !item.read).length;
  const isFeedLoading = loading && (!authLoaded || isSignedIn);
  const mutate = useCallback((id: string, field: "saved" | "read") => {
    const currentItem = items.find((item) => item.id === id);
    if (!currentItem) return;
    const nextValue = !currentItem[field];
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: nextValue } : item));
    setSelectedItem((current) => current?.id === id ? { ...current, [field]: nextValue } : current);
    trackEvent(id, field === "saved" ? (nextValue ? "save" : "unsave") : (nextValue ? "mark_read" : "mark_unread"));
    if (demoMode) return;
    void fetch(`/api/items/${id}/state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value: nextValue }),
    }).then((response) => {
      if (!response.ok) throw new Error("Could not update story");
    }).catch(() => {
      setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: !nextValue } : item));
      setSelectedItem((current) => current?.id === id ? { ...current, [field]: !nextValue } : current);
      setNotice("That change could not be saved. Please try again.");
    });
  }, [demoMode, items, trackEvent]);

  const openBrief = useCallback((item: FeedItem) => {
    setSelectedItem(item);
    trackEvent(item.id, "open");
  }, [trackEvent]);

  useEffect(() => {
    if (!selectedItem && !adding && !mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedItem(null);
      setAdding(false);
      setMobileNavOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [adding, mobileNavOpen, selectedItem]);

  useEffect(() => {
    if (demoMode || isFeedLoading || visible.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.55) continue;
        const id = (entry.target as HTMLElement).dataset.itemId;
        if (!id || seenItems.current.has(id)) continue;
        seenItems.current.add(id);
        trackEvent(id, "impression");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.55 });
    const stories = document.querySelectorAll<HTMLElement>(".feed-story[data-item-id]");
    stories.forEach((story) => observer.observe(story));
    return () => observer.disconnect();
  }, [demoMode, isFeedLoading, trackEvent, visible]);

  function selectInterest(nextInterest: Interest | "All Interests") {
    setInterest(nextInterest);
    document.getElementById("briefing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectView(nextView: FeedView) {
    if (!demoMode) setLoading(true);
    setView(nextView);
    setMobileNavOpen(false);
  }

  async function addLink(event: React.FormEvent) {
    event.preventDefault();
    if (!authLoaded) {
      setNotice("Checking your sign-in. Please try again in a moment.");
      return;
    }
    if (!isSignedIn) {
      setNotice("Sign in before adding an article to Marky.");
      return;
    }
    try {
      const parsed = new URL(submittedUrl);
      if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error();
      setSubmittingLink(true);
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: parsed.toString() }),
      });
      const payload = await response.json() as { submissionId?: string; status?: string; error?: string };
      if (!response.ok || !payload.submissionId) throw new Error(payload.error ?? "The link could not be queued.");
      setPendingSubmissionIds((current) => current.includes(payload.submissionId!) ? current : [...current, payload.submissionId!]);
      setSubmittedUrl("");
      setAdding(false);
      setSavedOnly(initialPage === "saved");
      setInterest("All Interests");
      setNotice("Link queued. Marky will notify you when the article is ready.");
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "Enter a valid public HTTP or HTTPS link.");
    } finally {
      setSubmittingLink(false);
    }
  }

  return <div className="reader-shell" id="top">
    <header className="reader-header">
      <div className="header-brand"><button className="icon-button mobile-menu" aria-label={mobileNavOpen ? "Close menu" : "Open menu"} aria-expanded={mobileNavOpen} aria-controls="mobile-navigation" onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={23} /> : <Menu size={23} />}</button><a className="marky-wordmark" href="#top">marky</a></div>
      <label className="reader-search"><Search size={20} aria-hidden="true" /><span className="sr-only">Search Marky</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Marky" />{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button> : null}</label>
      <div className="header-actions"><button className="write-action" onClick={() => setAdding(true)}><PenLine size={19} /> Add link</button><button className="icon-button notification-button" aria-label={pendingSubmissionIds.length ? `${pendingSubmissionIds.length} links processing` : "No new notifications"} title={pendingSubmissionIds.length ? "Link processing" : "No new notifications"} onClick={() => pendingSubmissionIds.length && setNotice(`Marky is processing ${pendingSubmissionIds.length} ${pendingSubmissionIds.length === 1 ? "link" : "links"}.`)}><Bell size={21} />{pendingSubmissionIds.length ? <span aria-hidden="true" /> : null}</button>{authEnabled ? <AuthControls /> : <span className="demo-avatar">M</span>}</div>
    </header>

    <aside className="reader-nav" aria-label="Main navigation">
      <nav><Link className={initialPage === "home" && !savedOnly && view === "for-you" ? "nav-link active" : "nav-link"} href="/"><Home size={23} /> Home</Link><Link className={initialPage === "saved" ? "nav-link active" : "nav-link"} href="/saved"><Library size={22} /> Saved</Link><Link className={initialPage === "profile" ? "nav-link active" : "nav-link"} href="/profile"><UserRound size={22} /> Profile</Link>{initialPage !== "home" ? <Link className="nav-link" href="/#briefing"><Compass size={22} /> Discover</Link> : <button className={!savedOnly && view === "latest" ? "nav-link active" : "nav-link"} onClick={() => { setSavedOnly(false); selectView("latest"); }}><Compass size={22} /> Discover</button>}</nav>
      <div className="nav-prompt"><Sparkles size={20} /><strong>Make Marky yours</strong><p>Choose interests and save useful reads to improve your briefing.</p><button onClick={() => document.getElementById("topics")?.scrollIntoView({ behavior: "smooth" })}>Tune your feed</button></div>
      <p className="nav-footer">About · Help · Privacy<br />© 2026 Marky</p>
    </aside>

    <AnimatePresence>{mobileNavOpen ? <><motion.button className="mobile-nav-scrim" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside id="mobile-navigation" className="mobile-nav-panel" aria-label="Mobile navigation" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }}><nav><Link className={initialPage === "home" ? "nav-link active" : "nav-link"} href="/"><Home size={22} /> Home</Link><Link className={initialPage === "saved" ? "nav-link active" : "nav-link"} href="/saved"><Library size={21} /> Saved</Link><Link className={initialPage === "profile" ? "nav-link active" : "nav-link"} href="/profile"><UserRound size={21} /> Profile</Link>{initialPage !== "home" ? <Link className="nav-link" href="/#briefing"><Compass size={21} /> Discover</Link> : <button className={!savedOnly && view === "latest" ? "nav-link active" : "nav-link"} onClick={() => { setSavedOnly(false); selectView("latest"); }}><Compass size={21} /> Discover</button>}</nav><div className="mobile-nav-cta"><p>Build a reading list that gets smarter with every save.</p><button onClick={() => { setMobileNavOpen(false); setAdding(true); }}><Plus size={17} /> Add an article</button></div></motion.aside></> : null}</AnimatePresence>

    {initialPage === "profile" ? <main className="reader-main profile-main"><ProfilePanel authEnabled={authEnabled} authLoaded={authLoaded} isSignedIn={isSignedIn} user={userSummary} items={items} /></main> : <main className="reader-main" id="briefing">
      <section className="feed-heading"><div><p className="section-kicker">{initialPage === "saved" ? "Your library" : "Your briefing"}</p><h1>{initialPage === "saved" ? "Saved for later" : viewCopy[view].title}</h1><p>{initialPage === "saved" ? "Every article you saved, collected in one quiet place." : viewCopy[view].subtitle}</p></div><button className="primary-add" onClick={() => setAdding(true)}><Plus size={17} /> Add link</button></section>
      {initialPage === "home" ? <section className="reader-tabs" aria-label="Feed controls"><div role="tablist">{(["for-you", "trending", "latest"] as FeedView[]).map((tab) => <button key={tab} role="tab" aria-selected={view === tab} className={view === tab ? "active" : ""} onClick={() => selectView(tab)}>{viewCopy[tab].label}</button>)}</div><span>{unreadCount} unread</span></section> : <section className="reader-tabs saved-page-summary" aria-label="Saved articles summary"><strong>{visible.length} {visible.length === 1 ? "article" : "articles"}</strong><span>{unreadCount} unread</span></section>}

      {pendingSubmissionIds.length ? <div className="processing-banner" role="status"><LoaderCircle size={17} aria-hidden="true" /><div><strong>Fetching your {pendingSubmissionIds.length === 1 ? "article" : "articles"}</strong><span>You can keep browsing. Marky will add {pendingSubmissionIds.length === 1 ? "it" : "them"} here automatically.</span></div></div> : null}

      <section className="feed-list" aria-live="polite">
        {isFeedLoading ? <div className="feed-loading" role="status" aria-label="Preparing your briefing">{[0, 1, 2].map((item) => <div className="story-skeleton" key={item}><div><span className="skeleton skeleton-line short" /><span className="skeleton skeleton-line title" /><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line medium" /></div><span className="skeleton skeleton-image" /></div>)}<span className="sr-only">Preparing your briefing…</span></div> : visible.length === 0 ? <div className="empty-state"><Search size={24} /><h2>{savedOnly ? "Your library is ready for its first story" : "No stories found"}</h2><p>{savedOnly ? "Save a useful article and it will stay here for later." : "Clear the search or choose another topic."}</p>{initialPage === "saved" ? <Link href="/">Browse stories</Link> : <button onClick={() => { setQuery(""); setInterest("All Interests"); setSavedOnly(false); }}>Show all stories</button>}</div> : <AnimatePresence mode="popLayout">{visible.map((item, index) => <motion.article data-item-id={item.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`${item.imageUrl ? "feed-story" : "feed-story text-only"}${item.read ? " read" : ""}`} key={item.id}>
          <div className="story-copy"><div className="story-byline"><span className="author-avatar">{item.author.charAt(0)}</span><span>{item.author}</span><span>·</span><span>{storyDate(item.publishedAt)}</span></div><button className="story-title" type="button" onClick={() => openBrief(item)}><h2>{item.title}</h2></button><p className="story-excerpt">{item.excerpt}</p>{item.explanation[0] ? <p className="ranking-reason"><Sparkles size={13} />{item.explanation[0]}</p> : null}<footer><div className="story-context"><span className="topic-pill">{item.interests[0]}</span><span>{readingMinutes(item)} min read</span>{item.engagementCount ? <span className="engagement-count" title="Public engagement"><Heart size={13} /> {compactCount(item.engagementCount)}</span> : null}<span className="desktop-only">· {item.source}</span></div><div className="story-actions"><button aria-label={item.read ? "Mark unread" : "Mark read"} title={item.read ? "Mark unread" : "Mark read"} onClick={() => mutate(item.id, "read")} className={item.read ? "active" : ""}><Check size={18} /></button><button aria-label={item.saved ? "Remove from saved" : "Save for later"} title={item.saved ? "Remove from saved" : "Save for later"} onClick={() => mutate(item.id, "saved")} className={item.saved ? "active" : ""}><Bookmark size={19} fill={item.saved ? "currentColor" : "none"} /></button><a href={item.url} target="_blank" rel="noreferrer" aria-label="Open original source" onClick={() => trackEvent(item.id, "open")}><ExternalLink size={18} /></a></div></footer></div>
          {item.imageUrl ? <button className="feed-thumbnail" type="button" aria-label={`View a brief for ${item.title}`} onClick={() => openBrief(item)}><Image src={item.imageUrl} alt={`Image published with ${item.title}`} fill unoptimized preload={index === 0} sizes="(max-width: 700px) 110px, 200px" /></button> : null}
        </motion.article>)}</AnimatePresence>}
      </section>
    </main>}

    {initialPage === "profile" ? <aside className="reader-rail profile-rail"><section className="rail-card welcome-card"><div className="rail-icon"><ShieldCheck size={22} /></div><h2>Your account is protected</h2><p>Authentication and account security are managed securely by Clerk.</p></section><section className="rail-section"><h2>Your Marky spaces</h2><Link className="profile-rail-link" href="/saved"><Library size={17} /> Open saved articles</Link><Link className="profile-rail-link" href="/"><Home size={17} /> Return to briefing</Link></section></aside> : <aside className="reader-rail">
      <section className="rail-card welcome-card"><div className="rail-icon"><Sparkles size={22} /></div><h2>A calmer technology feed</h2><p>Marky gathers useful reads, removes duplicates, and keeps your place.</p><button onClick={() => setAdding(true)}>Add your first source</button></section>
      <section className="rail-section" id="topics"><div className="rail-title"><h2>Topics</h2><button onClick={() => setInterest("All Interests")}>Reset</button></div><div className="rail-topics"><button className={interest === "All Interests" ? "active" : ""} onClick={() => selectInterest("All Interests")}>All</button>{interests.slice(0, 7).map((item) => <button className={interest === item ? "active" : ""} key={item} onClick={() => selectInterest(item)}>{item}</button>)}</div></section>
      <section className="rail-section"><h2>Today in Marky</h2><div className="today-stat"><strong>{visible.length}</strong><span>stories ready</span></div><div className="today-stat"><strong>{unreadCount}</strong><span>left to read</span></div><div className="today-stat"><MessageCircle size={18} /><span>Focused, duplicate-free feed</span></div></section>
    </aside>}

    <AnimatePresence>{adding ? <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => !submittingLink && setAdding(false)}><motion.section role="dialog" aria-modal="true" aria-labelledby="add-title" className="modal" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" disabled={submittingLink} onClick={() => setAdding(false)} aria-label="Close"><X /></button><p className="section-kicker">Reading queue</p><h2 id="add-title">Add an article to Marky</h2><p>Paste a public article URL. Marky will fetch its details and show it in your dashboard.</p><form onSubmit={addLink}><label htmlFor="url">Web address</label><input id="url" type="url" required placeholder="https://…" value={submittedUrl} onChange={(event) => setSubmittedUrl(event.target.value)} disabled={submittingLink} autoFocus /><button className="add-button" type="submit" disabled={submittingLink}>{submittingLink ? "Fetching article…" : "Fetch and add"}</button></form></motion.section></motion.div> : null}</AnimatePresence>
    <AnimatePresence>{selectedItem ? <motion.div className="modal-backdrop brief-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setSelectedItem(null)}><motion.article role="dialog" aria-modal="true" aria-labelledby="brief-title" className="article-brief" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} onMouseDown={(event) => event.stopPropagation()}>{selectedItem.imageUrl ? <div className="brief-image"><Image src={selectedItem.imageUrl} alt={`Image published with ${selectedItem.title}`} fill unoptimized sizes="(max-width: 700px) 100vw, 680px" /></div> : null}<div className="brief-body"><button className="modal-close" onClick={() => setSelectedItem(null)} aria-label="Close briefing"><X /></button><p className="section-kicker">{selectedItem.interests[0]} brief</p><h2 id="brief-title">{selectedItem.title}</h2><div className="brief-meta"><span>{selectedItem.author}</span><span>·</span><span>{selectedItem.source}</span><span>·</span><span>{storyDate(selectedItem.publishedAt)}</span><span>·</span><span>{readingMinutes(selectedItem)} min read</span></div><p className="brief-summary">{selectedItem.excerpt}</p><div className="brief-insight"><Sparkles size={17} /><div><strong>Why Marky selected this</strong><p>{selectedItem.explanation.join(" · ")}</p></div></div><div className="brief-actions"><button type="button" onClick={() => mutate(selectedItem.id, "saved")}><Bookmark size={18} fill={selectedItem.saved ? "currentColor" : "none"} />{selectedItem.saved ? "Saved" : "Save for later"}</button><a href={selectedItem.url} target="_blank" rel="noreferrer" onClick={() => trackEvent(selectedItem.id, "open")}>Read original <ExternalLink size={17} /></a></div></div></motion.article></motion.div> : null}</AnimatePresence>
    {notice ? <div className="toast" role="status" aria-live="polite"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={14} /></button></div> : null}
  </div>;
}
