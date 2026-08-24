-- ==========================================================
-- SMART SAFETY PENDANT - SUPABASE DATABASE & STORAGE SCHEMA
-- ==========================================================

-- 1. Create SOS Sessions Table
CREATE TABLE IF NOT EXISTS public.sos_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_name TEXT NOT NULL DEFAULT 'Emergency User',
    contact_phone TEXT,
    sos_type TEXT CHECK (sos_type IN ('stealth', 'full')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'resolved')),
    audio_snippet_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Live Coordinates Tracking Table
CREATE TABLE IF NOT EXISTS public.live_tracks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID REFERENCES public.sos_sessions(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy REAL DEFAULT 0.0,
    speed REAL DEFAULT 0.0,
    battery_level INT DEFAULT 100,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast realtime queries
CREATE INDEX IF NOT EXISTS idx_live_tracks_session ON public.live_tracks(session_id, recorded_at DESC);

-- 3. Enable Supabase Realtime for live_tracks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_tracks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_sessions;

-- 4. Enable Row Level Security (RLS) - Public Read/Write for Emergency Access
ALTER TABLE public.sos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read sos_sessions" ON public.sos_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert sos_sessions" ON public.sos_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update sos_sessions" ON public.sos_sessions FOR UPDATE USING (true);

CREATE POLICY "Allow public read live_tracks" ON public.live_tracks FOR SELECT USING (true);
CREATE POLICY "Allow public insert live_tracks" ON public.live_tracks FOR INSERT WITH CHECK (true);

-- 5. Supabase Storage Bucket Setup for 10-Second Audio Snippets
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-snippets', 'audio-snippets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy allowing anonymous public uploads and downloads
CREATE POLICY "Public Read Audio Snippets"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-snippets');

CREATE POLICY "Public Insert Audio Snippets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audio-snippets');
