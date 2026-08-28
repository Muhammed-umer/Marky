-- Marky Supabase Schema & Row-Level Security (RLS) Setup
-- Enables UUID extension and creates core domain tables and security policies

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

-- RLS Policies

-- Profiles Policies
CREATE POLICY "Users can select own profile" ON public.profiles
    FOR SELECT USING (clerk_user_id = auth.uid()::text OR auth.jwt() ->> 'sub' = clerk_user_id);

CREATE POLICY "Users can insert/update own profile" ON public.profiles
    FOR ALL USING (clerk_user_id = auth.uid()::text OR auth.jwt() ->> 'sub' = clerk_user_id);

-- Interests Policies (Readable by all authenticated users)
CREATE POLICY "Authenticated users can select interests" ON public.interests
    FOR SELECT USING (true);

-- User Interests Policies
CREATE POLICY "Users can manage own user_interests" ON public.user_interests
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.profiles 
            WHERE clerk_user_id = auth.uid()::text OR auth.jwt() ->> 'sub' = clerk_user_id
        )
    );

-- Sources Policies (Readable by all authenticated users)
CREATE POLICY "Authenticated users can select sources" ON public.sources
    FOR SELECT USING (true);

-- Content Items Policies (Readable by all authenticated users)
CREATE POLICY "Authenticated users can select content items" ON public.content_items
    FOR SELECT USING (true);

-- Content Item Interests Policies (Readable by all authenticated users)
CREATE POLICY "Authenticated users can select content_item_interests" ON public.content_item_interests
    FOR SELECT USING (true);

-- Saved Items Policies (Isolated to owner user)
CREATE POLICY "Users can manage own saved_items" ON public.saved_items
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.profiles 
            WHERE clerk_user_id = auth.uid()::text OR auth.jwt() ->> 'sub' = clerk_user_id
        )
    );
