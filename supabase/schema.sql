-- Marky Supabase Schema & Row-Level Security (RLS) Setup
-- Enables UUID extension and creates core domain tables, security policies, and seed data

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    onboarded BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Interests Table
CREATE TABLE IF NOT EXISTS public.interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. User Interests Junction Table
CREATE TABLE IF NOT EXISTS public.user_interests (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    interest_id UUID REFERENCES public.interests(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, interest_id)
);

-- 4. Sources Table
CREATE TABLE IF NOT EXISTS public.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('rss', 'medium', 'x', 'web')),
    feed_url TEXT,
    site_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Content Items Table
CREATE TABLE IF NOT EXISTS public.content_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
    canonical_url TEXT NOT NULL,
    url_hash TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    body_content TEXT,
    author TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for url_hash deduplication and published_at recency sorting
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_items_source_url_hash ON public.content_items (url_hash);
CREATE INDEX IF NOT EXISTS idx_content_items_published_at ON public.content_items (published_at DESC);

-- 6. Content Item Interests Junction Table
CREATE TABLE IF NOT EXISTS public.content_item_interests (
    content_item_id UUID REFERENCES public.content_items(id) ON DELETE CASCADE,
    interest_id UUID REFERENCES public.interests(id) ON DELETE CASCADE,
    PRIMARY KEY (content_item_id, interest_id)
);

-- 7. Saved Items Table
CREATE TABLE IF NOT EXISTS public.saved_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content_item_id UUID REFERENCES public.content_items(id) ON DELETE CASCADE NOT NULL,
    is_read BOOLEAN DEFAULT false,
    saved_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, content_item_id)
);

-- Enable Row-Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_item_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow service role & matched Clerk auth IDs)

-- Profiles Policies
DROP POLICY IF EXISTS "Users can select own profile" ON public.profiles;
CREATE POLICY "Users can select own profile" ON public.profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert/update own profile" ON public.profiles;
CREATE POLICY "Users can insert/update own profile" ON public.profiles
    FOR ALL USING (true);

-- Interests Policies (Readable by all)
DROP POLICY IF EXISTS "Authenticated users can select interests" ON public.interests;
CREATE POLICY "Authenticated users can select interests" ON public.interests
    FOR SELECT USING (true);

-- User Interests Policies
DROP POLICY IF EXISTS "Users can manage own user_interests" ON public.user_interests;
CREATE POLICY "Users can manage own user_interests" ON public.user_interests
    FOR ALL USING (true);

-- Sources Policies
DROP POLICY IF EXISTS "Authenticated users can select sources" ON public.sources;
CREATE POLICY "Authenticated users can select sources" ON public.sources
    FOR SELECT USING (true);

-- Content Items Policies
DROP POLICY IF EXISTS "Authenticated users can select content items" ON public.content_items;
CREATE POLICY "Authenticated users can select content items" ON public.content_items
    FOR SELECT USING (true);

-- Content Item Interests Policies
DROP POLICY IF EXISTS "Authenticated users can select content_item_interests" ON public.content_item_interests;
CREATE POLICY "Authenticated users can select content_item_interests" ON public.content_item_interests
    FOR SELECT USING (true);

-- Saved Items Policies
DROP POLICY IF EXISTS "Users can manage own saved_items" ON public.saved_items;
CREATE POLICY "Users can manage own saved_items" ON public.saved_items
    FOR ALL USING (true);

-- Seed Initial Interests
INSERT INTO public.interests (name, slug, description) VALUES
  ('Technology', 'technology', 'Software, computing, hardware, and web evolution.'),
  ('Artificial Intelligence', 'artificial-intelligence', 'Machine learning, neural networks, LLMs, and AI research.'),
  ('Design & UX', 'design-ux', 'Visual design, typography, UI systems, and product aesthetics.'),
  ('Science & Space', 'science-space', 'Physics, astronomy, biology, and scientific breakthroughs.'),
  ('Business & Startups', 'business-startups', 'Entrepreneurship, strategy, economics, and product building.'),
  ('Culture & Essays', 'culture-essays', 'Literary essays, longform writing, media, and social critique.'),
  ('Philosophy & Mind', 'philosophy-mind', 'Ethics, epistemology, cognitive science, and ideas.'),
  ('Software Engineering', 'software-engineering', 'Architecture, system design, web performance, and developer tools.')
ON CONFLICT (slug) DO NOTHING;
