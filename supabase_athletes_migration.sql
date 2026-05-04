-- ============================================================
-- RMM Athletes Table — Strava OAuth + Session Management
-- ============================================================
-- Run this in the Supabase SQL Editor (supabase.com → project → SQL Editor)
--
-- If the athletes table already exists from Gate G4, this script
-- will skip the CREATE and only add missing columns.
-- ============================================================

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS athletes (
  id              BIGSERIAL PRIMARY KEY,
  strava_id       BIGINT UNIQUE NOT NULL,

  -- Profile (from Strava OAuth response)
  first_name      TEXT,
  last_name       TEXT,
  profile_pic     TEXT,
  city            TEXT,
  country         TEXT,
  sex             TEXT,

  -- Strava OAuth tokens
  strava_access_token     TEXT,
  strava_refresh_token    TEXT,
  strava_token_expires_at BIGINT,         -- Unix timestamp (seconds)
  strava_scope            TEXT,

  -- Session management
  session_token   TEXT,

  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  last_login      TIMESTAMPTZ,

  -- Future fields (reserved, not used yet)
  rps_current     NUMERIC,
  athlete_level   TEXT,
  total_activities INTEGER DEFAULT 0
);

-- If the table already existed, add any columns that might be missing
-- (these are idempotent — they do nothing if the column already exists)

DO $$
BEGIN
  -- Strava OAuth columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'strava_id') THEN
    ALTER TABLE athletes ADD COLUMN strava_id BIGINT UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'strava_access_token') THEN
    ALTER TABLE athletes ADD COLUMN strava_access_token TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'strava_refresh_token') THEN
    ALTER TABLE athletes ADD COLUMN strava_refresh_token TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'strava_token_expires_at') THEN
    ALTER TABLE athletes ADD COLUMN strava_token_expires_at BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'strava_scope') THEN
    ALTER TABLE athletes ADD COLUMN strava_scope TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'session_token') THEN
    ALTER TABLE athletes ADD COLUMN session_token TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'profile_pic') THEN
    ALTER TABLE athletes ADD COLUMN profile_pic TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'last_login') THEN
    ALTER TABLE athletes ADD COLUMN last_login TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'sex') THEN
    ALTER TABLE athletes ADD COLUMN sex TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'athletes' AND column_name = 'country') THEN
    ALTER TABLE athletes ADD COLUMN country TEXT;
  END IF;
END $$;

-- Index for fast session lookups
CREATE INDEX IF NOT EXISTS idx_athletes_session_token ON athletes (session_token)
  WHERE session_token IS NOT NULL;

-- Index for Strava ID lookups (the UNIQUE constraint already creates one, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_athletes_strava_id ON athletes (strava_id);

-- Enable Row Level Security (service role key bypasses RLS)
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;

-- No public access policies — all reads/writes go through service role key in serverless functions
-- This means the anon key cannot read the athletes table (which is correct — tokens are sensitive)

-- ============================================================
-- Verification: run this after to confirm the table is ready
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'athletes' ORDER BY ordinal_position;
