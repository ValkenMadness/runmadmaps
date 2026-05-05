-- ============================================================
-- RMM Activities + RPS Tables Migration
-- ============================================================
-- Run this in the Supabase SQL Editor (supabase.com -> project -> SQL Editor)
-- This creates the activities, rps_scores, rps_history, and route_analyses tables.
-- Safe to re-run — uses IF NOT EXISTS throughout.
-- If activities table already exists, adds missing columns idempotently.
-- ============================================================

-- ============================================================
-- 1. ACTIVITIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activities (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  athlete_id            TEXT NOT NULL,
  strava_activity_id    TEXT,
  filename              TEXT,
  display_name          TEXT,
  activity_type         TEXT NOT NULL DEFAULT 'trail',
  purpose               TEXT NOT NULL DEFAULT 'training',
  source                TEXT DEFAULT 'upload',
  date                  TIMESTAMPTZ,

  -- Metrics (denormalised for fast queries)
  total_distance_km     NUMERIC DEFAULT 0,
  total_elevation_gain  NUMERIC DEFAULT 0,
  elapsed_time_seconds  NUMERIC DEFAULT 0,
  rmm_moving_time_seconds NUMERIC DEFAULT 0,
  elevation_density     NUMERIC DEFAULT 0,
  rmm_avg_pace_sec_per_km NUMERIC DEFAULT 0,
  rmm_avg_speed_kmh     NUMERIC DEFAULT 0,
  terrain_difficulty_score NUMERIC,
  pace_consistency_score NUMERIC,
  pace_consistency_tier  TEXT,

  -- GPS data
  start_lat             NUMERIC,
  start_lon             NUMERIC,
  start_time            TIMESTAMPTZ,
  km_splits             JSONB DEFAULT '[]'::jsonb,

  -- Raw data storage
  raw_data              JSONB,
  raw_gpx               TEXT,

  -- Anti-gaming
  flags                 JSONB DEFAULT '[]'::jsonb,
  include_in_scoring    BOOLEAN DEFAULT true,

  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- If the activities table already existed, add any missing columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'athlete_id') THEN
    ALTER TABLE activities ADD COLUMN athlete_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'strava_activity_id') THEN
    ALTER TABLE activities ADD COLUMN strava_activity_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'filename') THEN
    ALTER TABLE activities ADD COLUMN filename TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'display_name') THEN
    ALTER TABLE activities ADD COLUMN display_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'activity_type') THEN
    ALTER TABLE activities ADD COLUMN activity_type TEXT DEFAULT 'trail';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'purpose') THEN
    ALTER TABLE activities ADD COLUMN purpose TEXT DEFAULT 'training';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'source') THEN
    ALTER TABLE activities ADD COLUMN source TEXT DEFAULT 'upload';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'date') THEN
    ALTER TABLE activities ADD COLUMN date TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'total_distance_km') THEN
    ALTER TABLE activities ADD COLUMN total_distance_km NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'total_elevation_gain') THEN
    ALTER TABLE activities ADD COLUMN total_elevation_gain NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'elapsed_time_seconds') THEN
    ALTER TABLE activities ADD COLUMN elapsed_time_seconds NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'rmm_moving_time_seconds') THEN
    ALTER TABLE activities ADD COLUMN rmm_moving_time_seconds NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'elevation_density') THEN
    ALTER TABLE activities ADD COLUMN elevation_density NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'rmm_avg_pace_sec_per_km') THEN
    ALTER TABLE activities ADD COLUMN rmm_avg_pace_sec_per_km NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'rmm_avg_speed_kmh') THEN
    ALTER TABLE activities ADD COLUMN rmm_avg_speed_kmh NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'terrain_difficulty_score') THEN
    ALTER TABLE activities ADD COLUMN terrain_difficulty_score NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'pace_consistency_score') THEN
    ALTER TABLE activities ADD COLUMN pace_consistency_score NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'pace_consistency_tier') THEN
    ALTER TABLE activities ADD COLUMN pace_consistency_tier TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'start_lat') THEN
    ALTER TABLE activities ADD COLUMN start_lat NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'start_lon') THEN
    ALTER TABLE activities ADD COLUMN start_lon NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'start_time') THEN
    ALTER TABLE activities ADD COLUMN start_time TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'km_splits') THEN
    ALTER TABLE activities ADD COLUMN km_splits JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'raw_data') THEN
    ALTER TABLE activities ADD COLUMN raw_data JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'raw_gpx') THEN
    ALTER TABLE activities ADD COLUMN raw_gpx TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'flags') THEN
    ALTER TABLE activities ADD COLUMN flags JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'include_in_scoring') THEN
    ALTER TABLE activities ADD COLUMN include_in_scoring BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'created_at') THEN
    ALTER TABLE activities ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'updated_at') THEN
    ALTER TABLE activities ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Drop any NOT NULL constraints that might block inserts from Strava sync
-- (the sync doesn't send every column the old schema might require)
DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'activities'
      AND is_nullable = 'NO'
      AND column_name NOT IN ('id')
  LOOP
    EXECUTE format('ALTER TABLE activities ALTER COLUMN %I DROP NOT NULL', col.column_name);
  END LOOP;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activities_athlete_id ON activities (athlete_id);
CREATE INDEX IF NOT EXISTS idx_activities_athlete_type ON activities (athlete_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_strava_id ON activities (strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- RLS — service role only
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. ROUTE ANALYSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS route_analyses (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  activity_id           TEXT NOT NULL,
  grade_data            JSONB,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_analyses_activity ON route_analyses (activity_id);

ALTER TABLE route_analyses ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 3. RPS SCORES TABLE (current scores, one per athlete+type)
-- ============================================================
CREATE TABLE IF NOT EXISTS rps_scores (
  id                    BIGSERIAL,
  athlete_id            TEXT NOT NULL,
  activity_type         TEXT NOT NULL,
  rps                   NUMERIC DEFAULT 0,
  level_name            TEXT,
  level                 JSONB,
  activity_count        INTEGER DEFAULT 0,
  reference_date        TIMESTAMPTZ,
  rps_data              JSONB,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (athlete_id, activity_type)
);

ALTER TABLE rps_scores ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 4. RPS HISTORY TABLE (score snapshots over time)
-- ============================================================
CREATE TABLE IF NOT EXISTS rps_history (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  athlete_id            TEXT NOT NULL,
  activity_type         TEXT NOT NULL,
  rps                   NUMERIC DEFAULT 0,
  level_name            TEXT,
  reference_date        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rps_history_athlete ON rps_history (athlete_id, activity_type, created_at DESC);

ALTER TABLE rps_history ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- Refresh PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Verification: run these after to confirm tables are ready
-- ============================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('activities', 'route_analyses', 'rps_scores', 'rps_history')
-- ORDER BY table_name;
