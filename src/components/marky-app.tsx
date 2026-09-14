"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useAuth, useUser, SignInButton, SignUpButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  ExternalLink,
  Heart,
  Home,
  Library,
  ListChecks,
  LoaderCircle,
  Mail,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  SlidersHorizontal,
  Rss,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AuthControls } from "@/components/auth-controls";
import { thumbnailUrl } from "@/lib/images";
import { rankItems } from "@/lib/ranking";
import { CARD_KEY_POINTS_MAX, keyPoints } from "@/lib/summarize";
import { interests, isValidAuthor, type FeedItem, type FeedView, type Interest } from "@/lib/types";

const viewCopy: Record<FeedView, { label: string; title: string; subtitle: string }> = {
  "for-you": { label: "For you", title: "Your daily technology briefing", subtitle: "A focused mix from the topics and sources you care about." },
  trending: { label: "Trending", title: "What is earning attention", subtitle: "Important stories appearing across independent technology sources." },
  latest: { label: "Latest", title: "The newest useful reads", subtitle: "Fresh technology writing, with the newest publications first." },
};

function storyDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)) : "Date unknown";
}

/**
 * From the stored article's real word count at ~200 wpm. Null when no body was
 * extracted: the figure is then omitted rather than estimated from the length
 * of the title, which is what it used to be.
 */
function readingMinutes(item: FeedItem): number | null {
  if (typeof item.wordCount !== "number" || item.wordCount <= 0) return null;
  return Math.max(1, Math.round(item.wordCount / 200));
}

function ReadingTime({ item, separator = false }: { item: FeedItem; separator?: boolean }) {
  const minutes = readingMinutes(item);
  if (!minutes) return null;
  return (
    <>
      {separator ? <span>·</span> : null}
      <span>{minutes} min read</span>
    </>
  );
}

/**
 * Three bars that fold into an X. `open` draws the X (the panel is open, click
 * closes it); the bars otherwise. The button's hover state previews the other
 * shape, so the icon always shows what a click will do. Pure CSS: see
 * `.burger` in reference.css.
 */
function BurgerIcon({ open }: { open: boolean }) {
  return (
    <span className={open ? "burger is-x" : "burger"} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * Stored bodies are plain text. Readability keeps paragraph breaks as
 * newlines; feed-derived text has often been collapsed to one line, so a
 * single long block is re-broken at sentence ends into readable paragraphs.
 */
function articleParagraphs(text: string): string[] {
  const blocks = text.split(/\n+/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 5) paragraphs.push(sentences.slice(index, index + 5).join(" "));
  return paragraphs;
}

/** Null body means nothing was extracted; the brief then shows summary + link only. */
type ArticleState = { id: string; bodyText: string | null };

function compactCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/**
 * Desktop sidebar state, remembered per browser. Modelled as an external store
 * rather than useState + effect: the server snapshot is always "expanded", the
 * client reads storage during hydration, so there is no mismatch and no
 * post-mount flash. A module-level mirror keeps the toggle working when
 * storage is unavailable (private mode, blocked site data).
 */
const NAV_COLLAPSED_KEY = "marky:nav-collapsed";
const NAV_COLLAPSED_EVENT = "marky:nav-collapsed";
let navCollapsedMirror: boolean | null = null;

function readNavCollapsed(): boolean {
  if (navCollapsedMirror !== null) return navCollapsedMirror;
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeNavCollapsed(next: boolean) {
  navCollapsedMirror = next;
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    // The mirror above still drives this page view.
  }
  window.dispatchEvent(new Event(NAV_COLLAPSED_EVENT));
}

function subscribeNavCollapsed(onChange: () => void) {
  window.addEventListener(NAV_COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(NAV_COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

type UserSummary = { name: string; email: string; imageUrl: string | null };
/** Reading-activity counts from /api/user/stats; null until loaded. */
type ProfileStats = { links: number; posts: number; read: number; topics: number };
type MarkyPage = "home" | "saved" | "profile";
type MarkyAppProps = { initialItems?: FeedItem[]; demoMode?: boolean; authEnabled: boolean; initialPage?: MarkyPage; initialIsSignedIn?: boolean };


function ProfilePanel({
  authEnabled,
  authLoaded,
  isSignedIn,
  user,
  stats,
  userTopics,
  onOpenTopicsModal,
}: {
  authEnabled: boolean;
  authLoaded: boolean;
  isSignedIn: boolean;
  user: UserSummary | null;
  stats: ProfileStats | null;
  userTopics: string[];
  onOpenTopicsModal: () => void;
}) {
  if (!authLoaded) {
    return (
      <div className="profile-loading" role="status">
        <span className="skeleton profile-avatar-skeleton" />
        <div>
          <span className="skeleton skeleton-line title" />
          <span className="skeleton skeleton-line medium" />
        </div>
        <span className="sr-only">Loading your profile…</span>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="profile-signin">
        <div className="profile-icon">
          <UserRound size={25} />
        </div>
        <p className="section-kicker">Your Marky profile</p>
        <h1>Sign in to see your profile</h1>
        <p>Your saved articles, reading history, and topic preferences will appear here.</p>
        {authEnabled ? <AuthControls /> : null}
      </section>
    );
  }

  // Counts come from the ownership tables, not the loaded feed: the dashboard
  // hides the reader's own links and only reaches back a few days.
  const stat = (value: number | undefined) => (typeof value === "number" ? value : "–");
  return (
    <div className="profile-content">
      <section className="profile-heading">
        <p className="section-kicker">Your account</p>
        <h1>Profile</h1>
        <p>Manage your Marky identity and see how your reading briefing is personalized.</p>
      </section>
      <section className="profile-card profile-identity">
        <div className="profile-avatar">
          {user?.imageUrl ? <Image src={user.imageUrl} alt="" fill unoptimized sizes="72px" /> : <UserRound size={30} />}
        </div>
        <div>
          <h2>{user?.name ?? "Marky reader"}</h2>
          <p>
            <Mail size={15} aria-hidden="true" />
            {user?.email}
          </p>
        </div>
        <span className="profile-status">
          <ShieldCheck size={15} /> Signed in
        </span>
      </section>
      <section className="profile-grid" aria-label="Reading activity" aria-busy={stats === null}>
        <div className="profile-stat">
          <strong>{stat(stats?.links)}</strong>
          <span>Saved links</span>
          <small>Added by you</small>
        </div>
        <div className="profile-stat">
          <strong>{stat(stats?.posts)}</strong>
          <span>Saved posts</span>
          <small>Bookmarked from the feed</small>
        </div>
        <div className="profile-stat">
          <strong>{stat(stats?.read)}</strong>
          <span>Articles read</span>
          <small>Marked read in your library</small>
        </div>
        <div className="profile-stat">
          <strong>{userTopics.length}</strong>
          <span>Topics followed</span>
          <small>Shape your briefing</small>
        </div>
      </section>
      <section className="profile-card profile-preferences">
        <div className="profile-preferences-header">
          <div>
            <span className="profile-card-icon">
              <Sparkles size={18} />
            </span>
            <h2>Your selected topics</h2>
            <p>Marky uses these topics to filter and rank content for your briefing.</p>
          </div>
          <button className="secondary-button" onClick={onOpenTopicsModal}>
            <SlidersHorizontal size={15} /> Edit topics
          </button>
        </div>
        <div className="profile-interest-list">
          {userTopics.length > 0 ? (
            userTopics.map((topic) => <span key={topic}>{topic}</span>)
          ) : (
            <p className="empty-topic-note">No topics selected yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function MarkyApp(props: MarkyAppProps) {
  return props.authEnabled ? <AuthenticatedMarkyApp {...props} /> : <MarkyExperience {...props} authLoaded isSignedIn={false} userSummary={null} />;
}

function AuthenticatedMarkyApp(props: MarkyAppProps) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const userSummary = user
    ? {
        name: user.fullName ?? user.firstName ?? "Marky reader",
        email: user.primaryEmailAddress?.emailAddress ?? "No primary email",
        imageUrl: user.imageUrl ?? null,
      }
    : null;
  return <MarkyExperience {...props} authLoaded={authLoaded} isSignedIn={Boolean(isSignedIn)} userSummary={userSummary} />;
}

export function PublicLanding({ authEnabled }: { authEnabled: boolean }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="public-landing">
      {/* Header */}
      <header className="public-header">
        <div className="public-header-inner">
          <div className="public-header-left">
            <a href="#top" className="public-brand">
              Marky
            </a>
          </div>
          <nav className="public-nav-links" aria-label="Public navigation">
            <a href="#preview">Preview</a>
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#topics">Topics</a>
          </nav>
          <div className="public-nav-actions">
            {authEnabled ? (
              <>
                <SignInButton mode="modal">
                  <button className="public-btn-secondary">Sign in</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="public-btn-primary">
                    Get started <ExternalLink size={15} />
                  </button>
                </SignUpButton>
              </>
            ) : (
              <button className="public-btn-primary">Get started</button>
            )}
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              <BurgerIcon open={mobileMenuOpen} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen ? (
          <motion.div
            className="public-mobile-drawer"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <a href="#preview" onClick={() => setMobileMenuOpen(false)}>
              Preview
            </a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>
              How it works
            </a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>
              Features
            </a>
            <a href="#topics" onClick={() => setMobileMenuOpen(false)}>
              Topics
            </a>
            <div className="public-mobile-actions">
              {authEnabled ? (
                <>
                  <SignInButton mode="modal">
                    <button className="public-btn-secondary">Sign in</button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="public-btn-primary">Get started</button>
                  </SignUpButton>
                </>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main id="top">
        {/* 1. Hero Section */}
        <section className="public-hero">
          <div className="public-hero-kicker">
            <Sparkles size={14} /> YOUR TECHNOLOGY BRIEFING
          </div>
          <h1>A quieter way to keep up with technology.</h1>
          <p className="public-hero-desc">
            Marky continuously gathers technology content from independent software, AI, and engineering sources based on the topics you select, removing noise and duplicate stories while preserving original source links.
          </p>
        </section>

        {/* 2. Product Preview (Visual Centerpiece) */}
        <section className="public-preview-wrapper" id="preview">
          <div className="public-preview-card">
            <div className="public-preview-header">
              <div className="public-preview-tabs">
                <span className="public-preview-tab active">For you</span>
                <span className="public-preview-tab">Trending</span>
                <span className="public-preview-tab">Latest</span>
              </div>
              <span className="public-preview-badge">✦ Product Preview</span>
            </div>

            <div className="public-preview-body">
              {/* Mock Article 1 */}
              <article className="public-mock-story">
                <div className="public-mock-meta">
                  <span className="source-dot" />
                  <strong>Vercel Engineering</strong>
                  <span>·</span>
                  <span>Aug 28</span>
                  <span>·</span>
                  <span>4 min read</span>
                </div>
                <h2 className="public-mock-title">
                  Next.js 15 & React 19: Architectural changes and server performance
                </h2>
                <p className="public-mock-excerpt">
                  An in-depth breakdown of async request handling, server actions optimization, and static rendering improvements in modern web development.
                </p>
                <div className="public-mock-footer">
                  <div className="public-mock-tags">
                    <span className="public-mock-tag">Frameworks</span>
                    <span className="public-mock-tag">Next.js</span>
                    <span className="public-mock-tag">Performance</span>
                  </div>
                  <span className="public-mock-reason">
                    <Sparkles size={12} /> Matched your topics: Next.js & Frameworks
                  </span>
                  <div className="public-mock-actions">
                    <button className="public-mock-action-btn active" title="Saved">
                      <Bookmark size={15} />
                    </button>
                    <button className="public-mock-action-btn" title="External link">
                      <ExternalLink size={15} />
                    </button>
                  </div>
                </div>
              </article>

              {/* Mock Article 2 */}
              <article className="public-mock-story">
                <div className="public-mock-meta">
                  <span className="source-dot" />
                  <strong>Anthropic Research</strong>
                  <span>·</span>
                  <span>Aug 26</span>
                  <span>·</span>
                  <span>6 min read</span>
                </div>
                <h2 className="public-mock-title">
                  Building resilient multi-agent systems with structured output
                </h2>
                <p className="public-mock-excerpt">
                  Exploring determinism, error recovery, and context compaction techniques when deploying autonomous coding agents.
                </p>
                <div className="public-mock-footer">
                  <div className="public-mock-tags">
                    <span className="public-mock-tag">AI Agents</span>
                    <span className="public-mock-tag">LLMs</span>
                    <span className="public-mock-tag">Engineering</span>
                  </div>
                  <span className="public-mock-reason">
                    <Sparkles size={12} /> Matched your topics: AI Agents & LLMs
                  </span>
                  <div className="public-mock-actions">
                    <button className="public-mock-action-btn" title="Save for later">
                      <Bookmark size={15} />
                    </button>
                    <button className="public-mock-action-btn" title="External link">
                      <ExternalLink size={15} />
                    </button>
                  </div>
                </div>
              </article>

              {/* Mock Article 3 */}
              <article className="public-mock-story">
                <div className="public-mock-meta">
                  <span className="source-dot" />
                  <strong>Supabase Blog</strong>
                  <span>·</span>
                  <span>Aug 24</span>
                  <span>·</span>
                  <span>3 min read</span>
                </div>
                <h2 className="public-mock-title">
                  PostgreSQL row-level security patterns for multi-tenant applications
                </h2>
                <p className="public-mock-excerpt">
                  Best practices for configuring RLS policies, performance indexing, and token validation in production databases.
                </p>
                <div className="public-mock-footer">
                  <div className="public-mock-tags">
                    <span className="public-mock-tag">Databases</span>
                    <span className="public-mock-tag">Supabase</span>
                    <span className="public-mock-tag">Security</span>
                  </div>
                  <span className="public-mock-reason">
                    <Sparkles size={12} /> Because you follow Supabase
                  </span>
                  <div className="public-mock-actions">
                    <button className="public-mock-action-btn" title="Save for later">
                      <Bookmark size={15} />
                    </button>
                    <button className="public-mock-action-btn" title="External link">
                      <ExternalLink size={15} />
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* 3. How Marky Works (Workflow Section) */}
        <section className="public-workflow-section" id="how-it-works">
          <div className="public-section-title">
            <span className="public-section-kicker">SIMPLE MECHANISM</span>
            <h2>How Marky Works</h2>
            <p>A quiet, source-grounded pipeline designed to keep you informed without information overload.</p>
          </div>

          <div className="public-workflow-grid">
            <div className="public-workflow-step">
              <div className="public-step-number">01</div>
              <div className="public-step-icon">
                <SlidersHorizontal size={20} />
              </div>
              <h3>Choose your topics</h3>
              <p>Select the software entities, frameworks, and technical domains you care about.</p>
            </div>

            <div className="public-workflow-connector" aria-hidden="true" />

            <div className="public-workflow-step">
              <div className="public-step-number">02</div>
              <div className="public-step-icon">
                <Rss size={20} />
              </div>
              <h3>Continuous collection</h3>
              <p>Marky regularly monitors official RSS feeds, engineering blogs, and trusted sources.</p>
            </div>

            <div className="public-workflow-connector" aria-hidden="true" />

            <div className="public-workflow-step">
              <div className="public-step-number">03</div>
              <div className="public-step-icon">
                <Check size={20} />
              </div>
              <h3>Noise & duplicate removal</h3>
              <p>Articles are deduplicated by canonical hash and classified to filter out noise.</p>
            </div>

            <div className="public-workflow-connector" aria-hidden="true" />

            <div className="public-workflow-step">
              <div className="public-step-number">04</div>
              <div className="public-step-icon">
                <Sparkles size={20} />
              </div>
              <h3>Read your briefing</h3>
              <p>Enjoy a calm, personalized feed ordered by recency, relevance, and your preferences.</p>
            </div>
          </div>
        </section>

        {/* 4. Features Section */}
        <section className="public-features-section" id="features">
          <div className="public-section-title">
            <span className="public-section-kicker">ENGINEERED FOR QUALITY</span>
            <h2>Built for thoughtful technology readers</h2>
            <p>Concrete capabilities designed for software developers and technical professionals.</p>
          </div>
          <div className="public-features-grid">
            <div className="public-feature-card">
              <div className="public-feature-icon">
                <Sparkles size={22} />
              </div>
              <h3>Topic-based discovery</h3>
              <p>Follow verified direct sources like OpenAI, Hugging Face, Vercel, Supabase, Next.js, React, TypeScript, and GitHub without visiting dozens of sites.</p>
            </div>
            <div className="public-feature-card">
              <div className="public-feature-icon">
                <Compass size={22} />
              </div>
              <h3>Continuous collection</h3>
              <p>Marky monitors official RSS feeds and technical blogs, deduplicating stories and ranking them by relevance and recency.</p>
            </div>
            <div className="public-feature-card">
              <div className="public-feature-icon">
                <Bookmark size={22} />
              </div>
              <h3>Deduplication & noise removal</h3>
              <p>Articles are processed to filter out clickbait and duplicate stories, preserving exact source links and author attribution.</p>
            </div>
            <div className="public-feature-card">
              <div className="public-feature-icon">
                <ShieldCheck size={22} />
              </div>
              <h3>Source-grounded recommendations</h3>
              <p>Every story retains its canonical URL, publication timestamp, source attribution, and clear topic match explanations.</p>
            </div>
          </div>
        </section>

        {/* 5. Topics Showcase Section */}
        <section className="public-topics-section" id="topics">
          <div className="public-section-title">
            <span className="public-section-kicker">COVERED TECHNOLOGY TOPICS</span>
            <h2>Select topics matching your work</h2>
            <p>When you create your account, choose the engineering topics that matter to you.</p>
          </div>
          <div className="public-topics-grid">
            {[
              "OpenAI",
              "Hugging Face",
              "NVIDIA",
              "Google / Google DeepMind",
              "Vercel",
              "Supabase",
              "Resend",
              "Next.js",
              "React",
              "TypeScript",
              "GitHub",
              "Neon",
            ].map((topic) => (
              <span key={topic} className="public-topic-pill">
                {topic}
              </span>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <span className="public-footer-brand">Marky</span>
          <span className="public-footer-copy">© 2026 Marky. Source-grounded technology reader.</span>
          <div className="public-footer-links">
            <a href="#top">Back to top</a>
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#topics">Topics</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MarkyExperience({
  initialItems = [],
  demoMode = false,
  authEnabled,
  authLoaded,
  isSignedIn,
  userSummary,
  initialPage = "home",
  initialIsSignedIn = false,
}: MarkyAppProps & { authLoaded: boolean; isSignedIn: boolean; userSummary: UserSummary | null }) {
  const [items, setItems] = useState<FeedItem[]>(demoMode ? initialItems : []);
  const [view, setView] = useState<FeedView>("for-you");
  const [query, setQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(initialPage === "saved");
  // Saved page only: split the library into links the reader pasted in
  // themselves versus posts Marky found and they bookmarked.
  const [savedTab, setSavedTab] = useState<"links" | "posts">("links");
  const [adding, setAdding] = useState(false);
  const [editingTopics, setEditingTopics] = useState(false);
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingLink, setSubmittingLink] = useState(false);
  const [pendingSubmissionIds, setPendingSubmissionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(!demoMode && isSignedIn);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [article, setArticle] = useState<ArticleState | null>(null);
  const selectedItemId = selectedItem?.id ?? null;
  const articleEnabled = !demoMode && authLoaded && isSignedIn;
  // "Loading" is the gap between the open brief and the article that matches
  // it, so no state needs resetting when the selection changes.
  const articleLoading = articleEnabled && selectedItemId !== null && article?.id !== selectedItemId;
  // Keyed by item rather than a boolean: opening a different brief then
  // collapses on its own, with no effect writing state to reset it.
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const showFullArticle = expandedArticleId !== null && expandedArticleId === selectedItemId;

  // The brief leads with the points and keeps the full text one click away: a
  // 14-minute report dumped whole is not a brief. The feed already attached
  // the points to the card, so they show the instant the brief opens; the
  // body is only consulted for an item the feed had no points for.
  const briefPoints = useMemo(
    () => {
      if (selectedItem?.keyPoints?.length) return selectedItem.keyPoints;
      return article?.id === selectedItemId && article.bodyText
        ? keyPoints(article.bodyText, { aliases: selectedItem?.interests ?? [], max: CARD_KEY_POINTS_MAX })
        : [];
    },
    [article, selectedItemId, selectedItem],
  );
  const fullArticleMinutes = selectedItem ? readingMinutes(selectedItem) : null;

  // The body is loaded only for the brief the reader opened; it is not part of
  // the feed payload. Demo mode and signed-out views keep summary + link only.
  useEffect(() => {
    if (!selectedItemId || !articleEnabled) return;
    let cancelled = false;
    fetch(`/api/items/${selectedItemId}`, { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { bodyText: string | null }) : null))
      .then((data) => {
        if (!cancelled) setArticle({ id: selectedItemId, bodyText: data?.bodyText ?? null });
      })
      .catch(() => {
        if (!cancelled) setArticle({ id: selectedItemId, bodyText: null });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItemId, articleEnabled]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Desktop sidebar: collapsed narrows it to an icon rail, it never hides it,
  // so Home / Saved / Profile stay one click away in either state.
  const navCollapsed = useSyncExternalStore(subscribeNavCollapsed, readNavCollapsed, () => false);
  const toggleNav = () => writeNavCollapsed(!navCollapsed);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [userTopics, setUserTopics] = useState<string[]>([]);
  const [savingTopics, setSavingTopics] = useState(false);
  const [selectedTopicDraft, setSelectedTopicDraft] = useState<string[]>([]);

  const trackEvent = useCallback(
    (contentItemId: string, eventType: "impression" | "open" | "save" | "unsave" | "mark_read" | "mark_unread") => {
      if (demoMode || !authLoaded || !isSignedIn) return;
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientEventId: crypto.randomUUID(), contentItemId, type: eventType }),
        keepalive: true,
      });
    },
    [authLoaded, demoMode, isSignedIn],
  );

  // Search runs on the server over the whole window, so keystrokes are
  // debounced: one request per pause in typing, not one per character.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Paging: the server hands back the cursor for the next page, null at the end.
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load Feed Data & User Topics for Authenticated Users. Without a cursor the
  // list is replaced (new view, tab or search); with one, the page is appended.
  const fetchFeed = useCallback(async (cursor?: string) => {
    if (demoMode || !authLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }
    const search = new URLSearchParams({ view });
    if (initialPage === "saved") {
      search.set("page", "saved");
      search.set("tab", savedTab);
    }
    if (debouncedQuery) search.set("q", debouncedQuery);
    if (cursor) search.set("cursor", cursor);
    if (cursor) setLoadingMore(true);
    try {
      const response = await fetch(`/api/feed?${search.toString()}`, { cache: "no-store" });
      if (response.status === 401) {
        setItems([]);
        setLoading(false);
        return;
      }
      if (!response.ok) throw new Error("Feed unavailable");
      const payload = (await response.json()) as {
        items?: FeedItem[];
        nextCursor?: string | null;
        needsOnboarding?: boolean;
        selectedTopics?: string[];
      };

      if (payload.needsOnboarding) {
        setNeedsOnboarding(true);
        setItems([]);
        setNextCursor(null);
        setUserTopics([]);
      } else {
        setNeedsOnboarding(false);
        const page = payload.items ?? [];
        if (cursor) {
          setItems((current) => {
            const seen = new Set(current.map((item) => item.id));
            return [...current, ...page.filter((item) => !seen.has(item.id))];
          });
        } else {
          setItems(page);
          setHasLoadedOnce(true);
        }
        setNextCursor(payload.nextCursor ?? null);
        if (payload.selectedTopics) {
          setUserTopics(payload.selectedTopics);
          setSelectedTopicDraft(payload.selectedTopics);
        }
      }
    } catch {
      setNotice(cursor ? "Could not load more stories." : "Could not load your briefing.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [authLoaded, demoMode, isSignedIn, view, initialPage, savedTab, debouncedQuery]);

  useEffect(() => {
    if (demoMode || !authLoaded || !isSignedIn) return;
    const timer = setTimeout(() => {
      setLoading(true);
      void fetchFeed();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchFeed, demoMode, authLoaded, isSignedIn]);

  // Infinite scroll: a sentinel below the list asks for the next page as it
  // comes into view. One request in flight at a time; nothing once the
  // cursor is null.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinel || !nextCursor || loadingMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchFeed(nextCursor);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, nextCursor, loadingMore, loading, fetchFeed]);

  // Load User Topics on initial sign in
  useEffect(() => {
    if (demoMode || !authLoaded || !isSignedIn) return;
    fetch("/api/user/topics")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { topics?: Array<{ name: string }>; onboarded?: boolean };
        if (data.topics) {
          const topicNames = data.topics.map((t) => t.name);
          setUserTopics(topicNames);
          setSelectedTopicDraft(topicNames);
          if (topicNames.length === 0 && !data.onboarded) {
            setNeedsOnboarding(true);
          }
        }
      })
      .catch(() => undefined);
  }, [authLoaded, demoMode, isSignedIn]);

  // Save User Topics
  const saveUserTopics = async (topicNames: string[]) => {
    if (topicNames.length === 0) {
      setNotice("Please select at least one topic.");
      return;
    }
    // No profile to write to in demo mode; the selection lives in this tab.
    if (demoMode) {
      setUserTopics(topicNames);
      setSelectedTopicDraft(topicNames);
      setNeedsOnboarding(false);
      setEditingTopics(false);
      setNotice("Topic preferences updated for this demo session.");
      return;
    }
    setSavingTopics(true);
    try {
      const response = await fetch("/api/user/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicNames }),
      });
      if (!response.ok) throw new Error("Failed to save topics");
      const data = (await response.json()) as { topics?: Array<{ name: string }> };
      const savedNames = (data.topics ?? []).map((t) => t.name);
      setUserTopics(savedNames);
      setSelectedTopicDraft(savedNames);
      setNeedsOnboarding(false);
      setEditingTopics(false);
      setNotice("Topic preferences updated.");
      await fetchFeed();
    } catch {
      setNotice("Could not save topic selections. Please try again.");
    } finally {
      setSavingTopics(false);
    }
  };

  useEffect(() => {
    if (demoMode || pendingSubmissionIds.length === 0) return;
    let checking = false;
    const checkSubmissions = async () => {
      if (checking) return;
      checking = true;
      try {
        const statuses = await Promise.all(
          pendingSubmissionIds.map(async (id) => {
            const response = await fetch(`/api/submissions/${id}`, { cache: "no-store" });
            if (!response.ok) return { id, status: "pending" as const };
            const payload = (await response.json()) as {
              status: "queued" | "processing" | "completed" | "failed";
              item?: FeedItem | null;
            };
            return { id, ...payload };
          }),
        );
        for (const result of statuses) {
          if (result.status === "completed" && result.item) {
            // A submitted link belongs in Saved and nowhere else (see the feed
            // route's exclusion), so only the library shows it in place; the
            // dashboard gets the notice.
            if (initialPage === "saved") {
              setItems((current) => [result.item!, ...current.filter((item) => item.id !== result.item!.id && item.url !== result.item!.url)]);
            }
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
  }, [demoMode, initialPage, pendingSubmissionIds]);

  // Live mode: the server has already searched, split the library tab and
  // paged, so nothing is filtered here. Demo mode has no server round trip,
  // so it ranks and filters the bundled items locally against the topics the
  // reader picked -- with none picked, nothing is assumed on their behalf.
  const visible = useMemo(() => {
    const normalizedQuery = demoMode ? query.trim().toLowerCase() : "";
    const orderedItems = demoMode ? rankItems(items, view, userTopics as Interest[]) : items;
    return orderedItems.filter(
      (item) =>
        (initialPage === "saved" || savedOnly ? item.saved : true) &&
        (initialPage !== "saved" || (savedTab === "links" ? item.isSubmittedLink : !item.isSubmittedLink)) &&
        (!normalizedQuery || `${item.title} ${item.excerpt} ${item.source} ${item.author}`.toLowerCase().includes(normalizedQuery)),
    );
  }, [demoMode, initialPage, items, view, savedOnly, savedTab, query, userTopics]);

  const unreadCount = visible.filter((item) => !item.read).length;
  // The skeleton is for the first load only; a search or tab change keeps the
  // current list on screen and shows a quiet "updating" line instead.
  const isFeedLoading = loading && isSignedIn && !hasLoadedOnce;
  const isRefreshing = loading && isSignedIn && hasLoadedOnce;
  const isSearching = debouncedQuery.length > 0;

  // Profile counts: live from the ownership tables; demo from the bundled items.
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  useEffect(() => {
    if (initialPage !== "profile") return;
    if (demoMode) {
      const timer = setTimeout(() => setProfileStats({
        links: items.filter((item) => item.saved && item.isSubmittedLink).length,
        posts: items.filter((item) => item.saved && !item.isSubmittedLink).length,
        read: items.filter((item) => item.read).length,
        topics: userTopics.length,
      }), 0);
      return () => clearTimeout(timer);
    }
    if (!authLoaded || !isSignedIn) return;
    let cancelled = false;
    fetch("/api/user/stats", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as ProfileStats) : null))
      .then((data) => {
        if (!cancelled && data) setProfileStats(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialPage, demoMode, authLoaded, isSignedIn, items, userTopics]);

  const [pendingMutations, setPendingMutations] = useState<string[]>([]);

  const mutate = useCallback(
    (id: string, field: "saved" | "read") => {
      const mutationKey = `${id}:${field}`;
      if (pendingMutations.includes(mutationKey)) return;

      const currentItem = items.find((item) => item.id === id);
      if (!currentItem) return;
      const nextValue = !currentItem[field];

      setPendingMutations((current) => (current.includes(mutationKey) ? current : [...current, mutationKey]));
      setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: nextValue } : item)));
      setSelectedItem((current) => (current?.id === id ? { ...current, [field]: nextValue } : current));
      trackEvent(id, field === "saved" ? (nextValue ? "save" : "unsave") : (nextValue ? "mark_read" : "mark_unread"));

      if (demoMode) {
        setPendingMutations((current) => current.filter((k) => k !== mutationKey));
        return;
      }

      fetch(`/api/items/${id}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: nextValue }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not update story");
          const payload = (await response.json()) as { saved?: boolean; read?: boolean };
          if (typeof payload.saved === "boolean") {
            setItems((current) =>
              current.map((item) => (item.id === id ? { ...item, saved: payload.saved!, read: payload.read ?? item.read } : item)),
            );
            setSelectedItem((current) =>
              current?.id === id ? { ...current, saved: payload.saved!, read: payload.read ?? current.read } : current,
            );
          }
        })
        .catch(() => {
          setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: !nextValue } : item)));
          setSelectedItem((current) => (current?.id === id ? { ...current, [field]: !nextValue } : current));
          setNotice("That change could not be saved. Please try again.");
        })
        .finally(() => {
          setPendingMutations((current) => current.filter((k) => k !== mutationKey));
        });
    },
    [demoMode, items, pendingMutations, trackEvent],
  );

  const openBrief = useCallback(
    (item: FeedItem) => {
      setSelectedItem(item);
      trackEvent(item.id, "open");
    },
    [trackEvent],
  );

  useEffect(() => {
    if (!selectedItem && !adding && !mobileNavOpen && !editingTopics) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedItem(null);
      setAdding(false);
      setMobileNavOpen(false);
      setEditingTopics(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [adding, editingTopics, mobileNavOpen, selectedItem]);

  // The drawer only exists below 834px (see reference.css). If the window is
  // widened while it is open, close it, otherwise the body stays scroll-locked
  // for a panel that is no longer rendered.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const media = window.matchMedia("(min-width: 835px)");
    const close = () => {
      if (media.matches) setMobileNavOpen(false);
    };
    close();
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, [mobileNavOpen]);

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
      const payload = (await response.json()) as { submissionId?: string; status?: string; error?: string };
      if (!response.ok || !payload.submissionId) throw new Error(payload.error ?? "The link could not be queued.");
      setPendingSubmissionIds((current) => (current.includes(payload.submissionId!) ? current : [...current, payload.submissionId!]));
      setSubmittedUrl("");
      setAdding(false);
      setSavedOnly(initialPage === "saved");
      setNotice("Link queued. Marky will notify you when the article is ready.");
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "Enter a valid public HTTP or HTTPS link.");
    } finally {
      setSubmittingLink(false);
    }
  }

  const toggleTopicDraft = (topicName: string) => {
    setSelectedTopicDraft((prev) =>
      prev.includes(topicName) ? prev.filter((t) => t !== topicName) : [...prev, topicName],
    );
  };

  // Demo mode has no reader to sign in: the bundled items are the reader.
  // Without this, a demo deployment with no Clerk keys resolves to signed-out
  // once auth "loads" and shows the landing page instead of the reader.
  const effectiveIsSignedIn = demoMode || (authLoaded ? isSignedIn : (isSignedIn || initialIsSignedIn));

  if (!effectiveIsSignedIn) {
    return <PublicLanding authEnabled={authEnabled} />;
  }

  return (
    <div className={navCollapsed ? "reader-shell nav-collapsed" : "reader-shell"} id="top">
      <header className="reader-header">
        <div className="header-brand">
          <button
            className="icon-button mobile-menu"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <BurgerIcon open={mobileNavOpen} />
          </button>
          <Link className="marky-wordmark" href="/" aria-label="Marky home">
            Marky
          </Link>
        </div>
        <label className="reader-search">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Search Marky</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Marky" />
          {query ? (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={15} />
            </button>
          ) : null}
        </label>
        <div className="header-actions">
          <button className="write-action" onClick={() => setAdding(true)}>
            <PenLine size={19} /> Add link
          </button>
          <button
            className="icon-button notification-button"
            aria-label={pendingSubmissionIds.length ? `${pendingSubmissionIds.length} links processing` : "No new notifications"}
            title={pendingSubmissionIds.length ? "Link processing" : "No new notifications"}
            onClick={() => pendingSubmissionIds.length && setNotice(`Marky is processing ${pendingSubmissionIds.length} ${pendingSubmissionIds.length === 1 ? "link" : "links"}.`)}
          >
            <Bell size={21} />
            {pendingSubmissionIds.length ? <span aria-hidden="true" /> : null}
          </button>
          {authEnabled ? <AuthControls /> : <span className="demo-avatar">M</span>}
        </div>
      </header>

      <aside className="reader-nav" aria-label="Main navigation">
        <div className="reader-nav-top">
          <button
            type="button"
            className="icon-button nav-toggle"
            onClick={toggleNav}
            aria-expanded={!navCollapsed}
            aria-label={navCollapsed ? "Open sidebar" : "Close sidebar"}
            title={navCollapsed ? "Open sidebar" : "Close sidebar"}
          >
            <BurgerIcon open={!navCollapsed} />
          </button>
        </div>
        <nav>
          <Link className={initialPage === "home" ? "nav-link active" : "nav-link"} href="/" title="Home">
            <Home size={22} /> <span>Home</span>
          </Link>
          <Link className={initialPage === "saved" ? "nav-link active" : "nav-link"} href="/saved" title="Saved">
            <Library size={22} /> <span>Saved</span>
          </Link>
          <Link className={initialPage === "profile" ? "nav-link active" : "nav-link"} href="/profile" title="Profile">
            <UserRound size={22} /> <span>Profile</span>
          </Link>
        </nav>
        <p className="nav-footer">
          About · Help · Privacy
          <br />© 2026 Marky
        </p>
      </aside>

      <AnimatePresence>
        {mobileNavOpen ? (
          <>
            <motion.button
              className="mobile-nav-scrim"
              aria-label="Close menu"
              onClick={() => setMobileNavOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              id="mobile-navigation"
              className="mobile-nav-panel"
              aria-label="Mobile navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              <nav>
                <Link className={initialPage === "home" ? "nav-link active" : "nav-link"} href="/" onClick={() => setMobileNavOpen(false)}>
                  <Home size={22} /> Home
                </Link>
                <Link className={initialPage === "saved" ? "nav-link active" : "nav-link"} href="/saved" onClick={() => setMobileNavOpen(false)}>
                  <Library size={21} /> Saved
                </Link>
                <Link className={initialPage === "profile" ? "nav-link active" : "nav-link"} href="/profile" onClick={() => setMobileNavOpen(false)}>
                  <UserRound size={21} /> Profile
                </Link>
              </nav>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* Main Content Flow */}
      {initialPage === "profile" ? (
        <main className="reader-main profile-main">
          <ProfilePanel
            authEnabled={authEnabled}
            authLoaded={authLoaded}
            isSignedIn={isSignedIn}
            user={userSummary}
            stats={profileStats}
            userTopics={userTopics}
            onOpenTopicsModal={() => setEditingTopics(true)}
          />
        </main>
      ) : (
        <main className="reader-main" id="briefing">
          <section className="feed-heading">
            <div>
              <p className="section-kicker">{initialPage === "saved" ? "Your library" : "YOUR BRIEFING"}</p>
              <h1>{initialPage === "saved" ? "Saved for later" : "Your daily technology briefing"}</h1>
              <p>{initialPage === "saved" ? "Every article you saved, collected in one quiet place." : "A focused mix from the topics and sources you care about."}</p>
            </div>
            <button className="primary-add" onClick={() => setAdding(true)}>
              <Plus size={17} /> Add link
            </button>
          </section>

          {initialPage === "home" ? (
            <section className="reader-tabs" aria-label="Feed controls">
              <div role="tablist">
                {(["for-you", "trending", "latest"] as FeedView[]).map((tab) => (
                  <button key={tab} role="tab" aria-selected={view === tab} className={view === tab ? "active" : ""} onClick={() => selectView(tab)}>
                    {viewCopy[tab].label}
                  </button>
                ))}
              </div>
              <span>{isRefreshing ? (isSearching ? "Searching…" : "Updating…") : `${unreadCount} unread`}</span>
            </section>
          ) : (
            <section className="reader-tabs saved-page-summary" aria-label="Saved library">
              <div role="tablist">
                {(["links", "posts"] as const).map((tab) => (
                  <button key={tab} role="tab" aria-selected={savedTab === tab} className={savedTab === tab ? "active" : ""} onClick={() => setSavedTab(tab)}>
                    {tab === "links" ? "Links" : "Posts"}
                  </button>
                ))}
              </div>
              <span>
                {isRefreshing ? (isSearching ? "Searching…" : "Updating…") : (
                  <>
                    <strong>{visible.length}</strong> {visible.length === 1 ? "article" : "articles"} · {unreadCount} unread
                  </>
                )}
              </span>
            </section>
          )}

          {pendingSubmissionIds.length ? (
            <div className="processing-banner" role="status">
              <LoaderCircle size={17} aria-hidden="true" />
              <div>
                <strong>Fetching your {pendingSubmissionIds.length === 1 ? "article" : "articles"}</strong>
                <span>You can keep browsing. Marky will add {pendingSubmissionIds.length === 1 ? "it" : "them"} here automatically.</span>
              </div>
            </div>
          ) : null}

          <section className="feed-list" aria-live="polite">
            {isFeedLoading ? (
              <div className="feed-loading" role="status" aria-label="Preparing your briefing">
                {[0, 1, 2].map((item) => (
                  <div className="story-skeleton" key={item}>
                    <div>
                      <span className="skeleton skeleton-line short" />
                      <span className="skeleton skeleton-line title" />
                      <span className="skeleton skeleton-line" />
                      <span className="skeleton skeleton-line medium" />
                    </div>
                    <span className="skeleton skeleton-image" />
                  </div>
                ))}
                <span className="sr-only">Preparing your briefing…</span>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty-state">
                {isSearching ? <Search size={28} /> : <Compass size={28} />}
                <h2>
                  {isSearching
                    ? `No results for “${debouncedQuery}”`
                    : savedOnly
                    ? savedTab === "links"
                      ? "No links added yet"
                      : "No saved posts yet"
                    : "No stories found for your topics yet"}
                </h2>
                <p>
                  {isSearching
                    ? savedOnly
                      ? "Nothing in this part of your library matches. Try a different word, or check the other tab."
                      : "Nothing from the last year of your topics matches. Try a shorter or different word."
                    : savedOnly
                    ? savedTab === "links"
                      ? "Paste an article URL with Add link and it will stay here for later."
                      : "Bookmark a story from your feed and it will stay here for later."
                    : userTopics.length > 0
                    ? `You follow ${userTopics.slice(0, 3).join(", ")}${userTopics.length > 3 ? ` and ${userTopics.length - 3} more` : ""}. As matching stories are ingested from connected sources, they will appear here.`
                    : "Select topics to personalize your feed."}
                </p>
                {isSearching ? (
                  <button onClick={() => setQuery("")}>Clear search</button>
                ) : userTopics.length === 0 ? (
                  <button onClick={() => setEditingTopics(true)}>Select topics</button>
                ) : (
                  <button onClick={() => setAdding(true)}>Submit an article URL</button>
                )}
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {visible.map((item, index) => (
                  <motion.article
                    data-item-id={item.id}
                    layout
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`${item.imageUrl ? "feed-story" : "feed-story text-only"}${item.read ? " read" : ""}`}
                    key={item.id}
                  >
                    <div className="story-copy">
                      <div className="story-byline">
                        {isValidAuthor(item.author) ? (
                          <>
                            <span className="author-avatar">{item.author.charAt(0)}</span>
                            <span>{item.author}</span>
                            <span>·</span>
                          </>
                        ) : null}
                        <span>{storyDate(item.publishedAt)}</span>
                      </div>
                      <button className="story-title" type="button" onClick={() => openBrief(item)}>
                        <h2>{item.title}</h2>
                      </button>
                      <p className="story-excerpt">{item.excerpt}</p>
                      {item.keyPoints?.length ? (
                        // Native disclosure: closed by default so the list
                        // stays scannable, no state to reset on refetch, and
                        // keyboard/screen-reader behaviour comes for free.
                        <details className="story-points">
                          <summary>
                            <ListChecks size={14} aria-hidden="true" />
                            Key points
                            <span className="story-points-count">{item.keyPoints.length}</span>
                            <ChevronDown className="story-points-chevron" size={14} aria-hidden="true" />
                          </summary>
                          <ul>
                            {item.keyPoints.map((point, pointIndex) => (
                              <li key={pointIndex}>{point}</li>
                            ))}
                          </ul>
                          <p className="story-points-note">Sentences from the article itself, not a rewrite.</p>
                        </details>
                      ) : null}
                      {item.explanation[0] ? (
                        <p className="ranking-reason">
                          <Sparkles size={13} />
                          {item.explanation[0]}
                        </p>
                      ) : null}
                      <footer>
                        <div className="story-context">
                          <span className="topic-pill">{item.interests[0]}</span>
                          <ReadingTime item={item} />
                          {item.engagementCount ? (
                            <span className="engagement-count" title="Public engagement">
                              <Heart size={13} /> {compactCount(item.engagementCount)}
                            </span>
                          ) : null}
                          <span className="desktop-only">· {item.source}</span>
                        </div>
                        <div className="story-actions">
                          <button
                            aria-label={item.read ? "Mark unread" : "Mark read"}
                            title={item.read ? "Mark unread" : "Mark read"}
                            onClick={() => mutate(item.id, "read")}
                            className={item.read ? "active" : ""}
                          >
                            <Check size={18} />
                          </button>
                          <button
                            aria-label={item.saved ? "Remove from saved" : "Save for later"}
                            title={item.saved ? "Remove from saved" : "Save for later"}
                            onClick={() => mutate(item.id, "saved")}
                            className={item.saved ? "active" : ""}
                          >
                            <Bookmark size={19} fill={item.saved ? "currentColor" : "none"} />
                          </button>
                          <a href={item.url} target="_blank" rel="noreferrer" aria-label="Open original source" onClick={() => trackEvent(item.id, "open")}>
                            <ExternalLink size={18} />
                          </a>
                        </div>
                      </footer>
                    </div>
                    {item.imageUrl ? (
                      <button className="feed-thumbnail" type="button" aria-label={`View a brief for ${item.title}`} onClick={() => openBrief(item)}>
                        <Image
                          // The slot is 180px at its widest; 400 covers a dense
                          // display without pulling the publisher's original.
                          src={thumbnailUrl(item.imageUrl, 400) ?? item.imageUrl}
                          alt={`Image published with ${item.title}`}
                          fill
                          unoptimized
                          priority={index === 0}
                          sizes="(max-width: 700px) 110px, 200px"
                        />
                      </button>
                    ) : null}
                  </motion.article>
                ))}
              </AnimatePresence>
            )}
            {!isFeedLoading && visible.length > 0 ? (
              <div className="feed-more" ref={setSentinel} aria-live="polite">
                {loadingMore ? (
                  <>
                    <LoaderCircle size={17} aria-hidden="true" /> Loading more stories…
                  </>
                ) : nextCursor ? (
                  <button type="button" onClick={() => void fetchFeed(nextCursor)}>Load more</button>
                ) : (
                  <span>You&rsquo;re all caught up.</span>
                )}
              </div>
            ) : null}
          </section>
        </main>
      )}

      {/* Side Rail for Authenticated Users */}
      {isSignedIn ? (
        <aside className="reader-rail">
          <section className="rail-card welcome-card">
            <div className="rail-icon">
              <Sparkles size={22} />
            </div>
            <h2>A calmer technology feed</h2>
            <p>Marky gathers useful reads, removes duplicates, and keeps your place.</p>
          </section>
          <section className="rail-section">
            <div className="rail-title">
              <h2>Your topics ({userTopics.length})</h2>
              <button onClick={() => setEditingTopics(true)}>Edit</button>
            </div>
            <div className="rail-topics">
              {userTopics.map((topicName) => (
                <span className="topic-tag-pill" key={topicName}>
                  {topicName}
                </span>
              ))}
            </div>
          </section>
        </aside>
      ) : null}

      {/* Dedicated First-Time Topic Onboarding Modal */}
      <AnimatePresence>
        {needsOnboarding ? (
          <motion.div
            className="onboarding-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="onboarding-title"
              className="onboarding-modal-card"
              initial={{ opacity: 0, y: 22, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.97 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="onboarding-card-header">
                <span className="onboarding-eyebrow">
                  <Sparkles size={13} /> GET YOUR BRIEFING
                </span>
                <h2 id="onboarding-title">Choose what you want to follow</h2>
                <p>Select the technology topics you care about. Marky will use them to build your personalized briefing.</p>
              </div>

              <div className="topic-card-grid">
                {interests.map((topicName) => {
                  const isSelected = selectedTopicDraft.includes(topicName);
                  return (
                    <button
                      key={topicName}
                      type="button"
                      className={`topic-select-card ${isSelected ? "selected" : ""}`}
                      onClick={() => toggleTopicDraft(topicName)}
                      aria-pressed={isSelected}
                    >
                      <span className="topic-card-icon">
                        {isSelected ? <Check size={13} /> : <Plus size={13} />}
                      </span>
                      <span className="topic-card-name">{topicName}</span>
                    </button>
                  );
                })}
              </div>

              <div className="onboarding-card-footer">
                <span className="onboarding-topic-count">
                  {selectedTopicDraft.length === 0 ? (
                    <span className="count-hint">Select at least 1 topic to continue</span>
                  ) : (
                    <span className="count-active">
                      <Check size={14} /> {selectedTopicDraft.length} {selectedTopicDraft.length === 1 ? "topic" : "topics"} selected
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="onboarding-submit-btn"
                  disabled={savingTopics || selectedTopicDraft.length === 0}
                  onClick={() => void saveUserTopics(selectedTopicDraft)}
                >
                  {savingTopics ? "Saving preferences…" : "Save topics & open briefing"}
                </button>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Topic Editing Modal */}
      <AnimatePresence>
        {editingTopics ? (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => !savingTopics && setEditingTopics(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="topics-title"
              className="modal topics-modal"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button className="modal-close" disabled={savingTopics} onClick={() => setEditingTopics(false)} aria-label="Close">
                <X />
              </button>
              <p className="section-kicker">Reading preferences</p>
              <h2 id="topics-title">Manage your followed topics</h2>
              <p>Select the topics you want to follow. Your feed will automatically refresh with matching content.</p>
              <label className="topics-select-all">
                <input
                  type="checkbox"
                  checked={selectedTopicDraft.length === interests.length}
                  onChange={() =>
                    setSelectedTopicDraft((prev) => (prev.length === interests.length ? [] : [...interests]))
                  }
                />
                {selectedTopicDraft.length === interests.length ? "Deselect all" : "Select all"}
              </label>
              <div className="topic-card-grid">
                {interests.map((topicName) => {
                  const isSelected = selectedTopicDraft.includes(topicName);
                  return (
                    <button
                      key={topicName}
                      type="button"
                      className={`topic-select-card ${isSelected ? "selected" : ""}`}
                      onClick={() => toggleTopicDraft(topicName)}
                      aria-pressed={isSelected}
                    >
                      <span className="topic-card-icon">
                        {isSelected ? <Check size={13} /> : <Plus size={13} />}
                      </span>
                      <span className="topic-card-name">{topicName}</span>
                    </button>
                  );
                })}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={savingTopics || selectedTopicDraft.length === 0}
                  onClick={() => void saveUserTopics(selectedTopicDraft)}
                >
                  {savingTopics ? "Saving preferences…" : "Save changes"}
                </button>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Add Link Modal */}
      <AnimatePresence>
        {adding ? (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => !submittingLink && setAdding(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-title"
              className="modal"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button className="modal-close" disabled={submittingLink} onClick={() => setAdding(false)} aria-label="Close">
                <X />
              </button>
              <p className="section-kicker">Reading queue</p>
              <h2 id="add-title">Add an article to Marky</h2>
              <p>Paste a public article URL. Marky will fetch its details and show it in your dashboard.</p>
              <form onSubmit={addLink}>
                <label htmlFor="url">Web address</label>
                <input
                  id="url"
                  type="url"
                  required
                  placeholder="https://…"
                  value={submittedUrl}
                  onChange={(event) => setSubmittedUrl(event.target.value)}
                  disabled={submittingLink}
                  autoFocus
                />
                <button className="add-button" type="submit" disabled={submittingLink}>
                  {submittingLink ? "Fetching article…" : "Fetch and add"}
                </button>
              </form>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Story Brief Modal */}
      <AnimatePresence>
        {selectedItem ? (
          <motion.div
            className="modal-backdrop brief-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setSelectedItem(null)}
          >
            <motion.article
              role="dialog"
              aria-modal="true"
              aria-labelledby="brief-title"
              className="article-brief"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {selectedItem.imageUrl ? (
                <div className="brief-image">
                  <Image
                    // The brief is 720px wide at most, so 800 is enough here.
                    src={thumbnailUrl(selectedItem.imageUrl, 800) ?? selectedItem.imageUrl}
                    alt={`Image published with ${selectedItem.title}`}
                    fill
                    unoptimized
                    sizes="(max-width: 700px) 100vw, 680px"
                  />
                </div>
              ) : null}
              <div className="brief-body">
                <button className="modal-close" onClick={() => setSelectedItem(null)} aria-label="Close briefing">
                  <X />
                </button>
                <p className="section-kicker">{selectedItem.interests[0]} brief</p>
                <h2 id="brief-title">{selectedItem.title}</h2>
                <div className="brief-meta">
                  {isValidAuthor(selectedItem.author) ? (
                    <>
                      <span>{selectedItem.author}</span>
                      <span>·</span>
                    </>
                  ) : null}
                  <span>{selectedItem.source}</span>
                  <span>·</span>
                  <span>{storyDate(selectedItem.publishedAt)}</span>
                  <ReadingTime item={selectedItem} separator />
                </div>
                <p className="brief-summary">{selectedItem.excerpt}</p>
                {briefPoints.length ? (
                  <div className="brief-points">
                    <strong>Key points</strong>
                    <ul>
                      {briefPoints.map((point, index) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                    <p className="brief-points-note">
                      Sentences taken from the article itself, not a rewrite.
                    </p>
                  </div>
                ) : null}
                {articleLoading ? <p className="brief-article-status">Loading the article…</p> : null}
                {article?.id === selectedItem.id && article.bodyText ? (
                  <div className="brief-article">
                    {showFullArticle ? (
                      <>
                        {articleParagraphs(article.bodyText).map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))}
                        <p className="brief-article-note">
                          Text extracted from {selectedItem.source}. The original is the record.
                        </p>
                      </>
                    ) : null}
                    <button type="button" className="brief-toggle" onClick={() => setExpandedArticleId(showFullArticle ? null : selectedItemId)}>
                      {showFullArticle ? "Hide full article" : `Read full article${fullArticleMinutes ? ` · ${fullArticleMinutes} min` : ""}`}
                    </button>
                  </div>
                ) : null}
                <div className="brief-insight">
                  <Sparkles size={17} />
                  <div>
                    <strong>Why Marky selected this</strong>
                    <p>{selectedItem.explanation.join(" · ")}</p>
                  </div>
                </div>
                <div className="brief-actions">
                  <button type="button" onClick={() => mutate(selectedItem.id, "saved")}>
                    <Bookmark size={18} fill={selectedItem.saved ? "currentColor" : "none"} />
                    {selectedItem.saved ? "Saved" : "Save for later"}
                  </button>
                  <a href={selectedItem.url} target="_blank" rel="noreferrer" onClick={() => trackEvent(selectedItem.id, "open")}>
                    Read original <ExternalLink size={17} />
                  </a>
                </div>
              </div>
            </motion.article>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
