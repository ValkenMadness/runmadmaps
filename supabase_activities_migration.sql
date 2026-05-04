-- ============================================================
-- RMM Activities + RPS Tables Migration
-- ============================================================
-- Run this in the Supabase SQL Editor (supabase.com -> project -> SQL Editor)
-- This creates the activities, rps_scores, rps_history, and route_analyses tables.
-- Safe to re-run — uses IF NOT EXISTS throughout.
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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activities_athlete_id ON activities (athlete_id);
CREATE INDEX IF NOT EXISTS idx_activities_athlete_type ON activities (athlete_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_athlete_date ON activities (athlete_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_strava_id ON activities (strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_strava_unique ON activities (strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- RLS — service role only
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. ROUTE ANALYSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS route_analyses (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  activity_id           TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
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
