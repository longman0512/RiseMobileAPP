-- RISE — complete schema rebuild.
-- Generated from supabase/migrations/ in order. Paste into the Supabase
-- SQL editor of a NEW project and run once. Safe to re-run (idempotent).


-- ============================================================
-- 001_create_coins.sql
-- ============================================================
-- Coin registration: NFC tag UID linked to user accounts.
-- Run in Supabase SQL editor or via CLI.

CREATE TYPE public.coin_type AS ENUM ('lockin', 'flow', 'reset');

CREATE TABLE public.coins (
  coin_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  coin_type public.coin_type NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX coins_coin_id_active_idx
  ON public.coins (coin_id)
  WHERE active = true;

CREATE UNIQUE INDEX coins_user_type_active_idx
  ON public.coins (user_id, coin_type)
  WHERE active = true;

ALTER TABLE public.coins ENABLE ROW LEVEL SECURITY;

CREATE POLICY coins_select_own ON public.coins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY coins_insert_own ON public.coins
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY coins_update_own ON public.coins
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.register_coin(
  p_coin_id TEXT,
  p_coin_type public.coin_type
)
RETURNS public.coins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing public.coins;
  v_row public.coins;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_existing
  FROM public.coins
  WHERE coin_id = p_coin_id AND active = true;

  IF FOUND AND v_existing.user_id <> v_user_id THEN
    RAISE EXCEPTION 'This coin is already linked to an account'
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.coins
  SET active = false
  WHERE user_id = v_user_id AND coin_type = p_coin_type AND active = true;

  INSERT INTO public.coins (coin_id, user_id, coin_type, active)
  VALUES (p_coin_id, v_user_id, p_coin_type, true)
  ON CONFLICT (coin_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      coin_type = EXCLUDED.coin_type,
      active = true,
      registered_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_coin TO authenticated;


-- ============================================================
-- 002_redeem_activation_code.sql
-- ============================================================
-- Redeem an activation code for the authenticated user.
-- Run in Supabase SQL editor or via CLI.

-- The table this function operates on was originally created by hand in the
-- Supabase dashboard and never captured here, so a project rebuilt from
-- migrations alone failed on the index below. Defined now so the schema is
-- reproducible from scratch.
CREATE TABLE IF NOT EXISTS public.activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;

-- No client policies: codes are only ever touched through the SECURITY DEFINER
-- function below, so nobody can enumerate or forge them.

CREATE UNIQUE INDEX IF NOT EXISTS activation_codes_code_idx ON public.activation_codes (code);

CREATE OR REPLACE FUNCTION public.redeem_activation_code(p_code TEXT)
RETURNS public.activation_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.activation_codes;
  v_trimmed TEXT := trim(p_code);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'Invalid activation code';
  END IF;

  SELECT * INTO v_row
  FROM public.activation_codes
  WHERE code = v_trimmed
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid activation code';
  END IF;

  IF v_row.used THEN
    RAISE EXCEPTION 'This activation code has already been used';
  END IF;

  UPDATE public.activation_codes
  SET used = true,
      user_id = v_user_id,
      used_at = timezone('utc', now())
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_activation_code TO authenticated;


-- ============================================================
-- 003_sessions_and_stats.sql
-- ============================================================
-- Sessions, user_stats, and RPCs for protocol completion + history.
-- Run in Supabase SQL editor or via CLI.

DO $$ BEGIN
  CREATE TYPE public.coin_type AS ENUM ('lockin', 'flow', 'reset');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  coin_type public.coin_type NOT NULL,
  duration_mins BIGINT NOT NULL CHECK (duration_mins > 0),
  note TEXT,
  next_block TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_started_idx
  ON public.sessions (user_id, started_at DESC);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_select_own ON public.sessions;
CREATE POLICY sessions_select_own ON public.sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sessions_insert_own ON public.sessions;
CREATE POLICY sessions_insert_own ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_session_date DATE,
  total_lockin_mins BIGINT NOT NULL DEFAULT 0,
  total_flow_mins BIGINT NOT NULL DEFAULT 0,
  total_reset_mins BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_stats_select_own ON public.user_stats;
CREATE POLICY user_stats_select_own ON public.user_stats
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_stats_select_leaderboard ON public.user_stats;
CREATE POLICY user_stats_select_leaderboard ON public.user_stats
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS user_stats_upsert_own ON public.user_stats;
CREATE POLICY user_stats_upsert_own ON public.user_stats
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.complete_session(
  p_coin_type public.coin_type,
  p_started_at TIMESTAMPTZ,
  p_duration_mins BIGINT,
  p_note TEXT DEFAULT NULL,
  p_next_block TEXT DEFAULT NULL
)
RETURNS TABLE (
  out_session_id UUID,
  out_current_streak INT,
  out_longest_streak INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (timezone('utc', now()))::date;
  v_last DATE;
  v_streak INT;
  v_longest INT;
  v_row public.sessions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_duration_mins IS NULL OR p_duration_mins < 1 THEN
    RAISE EXCEPTION 'duration_mins must be at least 1';
  END IF;

  INSERT INTO public.sessions (user_id, started_at, coin_type, duration_mins, note, next_block)
  VALUES (v_user_id, p_started_at, p_coin_type, p_duration_mins, p_note, p_next_block)
  RETURNING * INTO v_row;

  SELECT us.last_session_date, us.current_streak, us.longest_streak
  INTO v_last, v_streak, v_longest
  FROM public.user_stats AS us
  WHERE us.user_id = v_user_id;

  IF NOT FOUND THEN
    v_streak := 0;
    v_longest := 0;
    v_last := NULL;
  END IF;

  IF p_duration_mins >= 5 THEN
    IF v_last = v_today THEN
      NULL;
    ELSIF v_last = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
    ELSE
      v_streak := 1;
    END IF;
    v_longest := GREATEST(COALESCE(v_longest, 0), v_streak);

    INSERT INTO public.user_stats (
      user_id,
      current_streak,
      longest_streak,
      last_session_date,
      total_lockin_mins,
      total_flow_mins,
      total_reset_mins,
      updated_at
    )
    VALUES (
      v_user_id,
      v_streak,
      v_longest,
      v_today,
      CASE WHEN p_coin_type = 'lockin' THEN p_duration_mins ELSE 0 END,
      CASE WHEN p_coin_type = 'flow' THEN p_duration_mins ELSE 0 END,
      CASE WHEN p_coin_type = 'reset' THEN p_duration_mins ELSE 0 END,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      current_streak = EXCLUDED.current_streak,
      longest_streak = EXCLUDED.longest_streak,
      last_session_date = EXCLUDED.last_session_date,
      total_lockin_mins = public.user_stats.total_lockin_mins +
        CASE WHEN p_coin_type = 'lockin' THEN p_duration_mins ELSE 0 END,
      total_flow_mins = public.user_stats.total_flow_mins +
        CASE WHEN p_coin_type = 'flow' THEN p_duration_mins ELSE 0 END,
      total_reset_mins = public.user_stats.total_reset_mins +
        CASE WHEN p_coin_type = 'reset' THEN p_duration_mins ELSE 0 END,
      updated_at = now();
  END IF;

  RETURN QUERY
  SELECT v_row.id, COALESCE(v_streak, 0), COALESCE(v_longest, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_session TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_session_history(p_limit INT DEFAULT 50)
RETURNS SETOF public.sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.sessions
  WHERE user_id = auth.uid()
  ORDER BY started_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

CREATE OR REPLACE FUNCTION public.get_my_user_stats()
RETURNS public.user_stats
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.user_stats
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_session_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_user_stats TO authenticated;


-- ============================================================
-- 004_session_stats_and_notes.sql
-- ============================================================
-- Fix: always update minute totals; streak only for sessions >= 5 min.
-- Add update_session_notes for journal after auto-save.

CREATE OR REPLACE FUNCTION public.complete_session(
  p_coin_type public.coin_type,
  p_started_at TIMESTAMPTZ,
  p_duration_mins BIGINT,
  p_note TEXT DEFAULT NULL,
  p_next_block TEXT DEFAULT NULL
)
RETURNS TABLE (
  out_session_id UUID,
  out_current_streak INT,
  out_longest_streak INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (timezone('utc', now()))::date;
  v_last DATE;
  v_streak INT;
  v_longest INT;
  v_row public.sessions;
  v_lockin_delta BIGINT := 0;
  v_flow_delta BIGINT := 0;
  v_reset_delta BIGINT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_duration_mins IS NULL OR p_duration_mins < 1 THEN
    RAISE EXCEPTION 'duration_mins must be at least 1';
  END IF;

  INSERT INTO public.sessions (user_id, started_at, coin_type, duration_mins, note, next_block)
  VALUES (v_user_id, p_started_at, p_coin_type, p_duration_mins, p_note, p_next_block)
  RETURNING * INTO v_row;

  IF p_coin_type = 'lockin' THEN
    v_lockin_delta := p_duration_mins;
  ELSIF p_coin_type = 'flow' THEN
    v_flow_delta := p_duration_mins;
  ELSE
    v_reset_delta := p_duration_mins;
  END IF;

  SELECT us.last_session_date, us.current_streak, us.longest_streak
  INTO v_last, v_streak, v_longest
  FROM public.user_stats AS us
  WHERE us.user_id = v_user_id;

  IF NOT FOUND THEN
    v_streak := 0;
    v_longest := 0;
    v_last := NULL;
  END IF;

  IF p_duration_mins >= 5 THEN
    IF v_last = v_today THEN
      NULL;
    ELSIF v_last = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
    ELSE
      v_streak := 1;
    END IF;
    v_longest := GREATEST(COALESCE(v_longest, 0), v_streak);
  END IF;

  INSERT INTO public.user_stats (
    user_id,
    current_streak,
    longest_streak,
    last_session_date,
    total_lockin_mins,
    total_flow_mins,
    total_reset_mins,
    updated_at
  )
  VALUES (
    v_user_id,
    CASE WHEN p_duration_mins >= 5 THEN v_streak ELSE COALESCE(v_streak, 0) END,
    CASE WHEN p_duration_mins >= 5 THEN v_longest ELSE COALESCE(v_longest, 0) END,
    CASE WHEN p_duration_mins >= 5 THEN v_today ELSE v_last END,
    v_lockin_delta,
    v_flow_delta,
    v_reset_delta,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_streak = CASE
      WHEN p_duration_mins >= 5 THEN EXCLUDED.current_streak
      ELSE public.user_stats.current_streak
    END,
    longest_streak = CASE
      WHEN p_duration_mins >= 5 THEN EXCLUDED.longest_streak
      ELSE public.user_stats.longest_streak
    END,
    last_session_date = CASE
      WHEN p_duration_mins >= 5 THEN EXCLUDED.last_session_date
      ELSE public.user_stats.last_session_date
    END,
    total_lockin_mins = public.user_stats.total_lockin_mins + v_lockin_delta,
    total_flow_mins = public.user_stats.total_flow_mins + v_flow_delta,
    total_reset_mins = public.user_stats.total_reset_mins + v_reset_delta,
    updated_at = now();

  RETURN QUERY
  SELECT v_row.id, COALESCE(v_streak, 0), COALESCE(v_longest, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_session_notes(
  p_session_id UUID,
  p_note TEXT DEFAULT NULL,
  p_next_block TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.sessions
  SET note = p_note, next_block = p_next_block
  WHERE id = p_session_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_notes TO authenticated;


-- ============================================================
-- 005_session_segments.sql
-- ============================================================
-- Persist multi-protocol session segments (FLOW / RESET chains) on sessions row.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS segments JSONB;

CREATE OR REPLACE FUNCTION public.complete_session(
  p_coin_type public.coin_type,
  p_started_at TIMESTAMPTZ,
  p_duration_mins BIGINT,
  p_note TEXT DEFAULT NULL,
  p_next_block TEXT DEFAULT NULL,
  p_segments JSONB DEFAULT NULL
)
RETURNS TABLE (
  out_session_id UUID,
  out_current_streak INT,
  out_longest_streak INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (timezone('utc', now()))::date;
  v_last DATE;
  v_streak INT;
  v_longest INT;
  v_row public.sessions;
  v_lockin_delta BIGINT := 0;
  v_flow_delta BIGINT := 0;
  v_reset_delta BIGINT := 0;
  v_total_mins BIGINT;
  v_seg JSONB;
  v_proto TEXT;
  v_mins BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_total_mins := 0;
  v_lockin_delta := 0;
  v_flow_delta := 0;
  v_reset_delta := 0;

  IF p_segments IS NOT NULL AND jsonb_array_length(p_segments) > 0 THEN
    FOR v_seg IN SELECT value FROM jsonb_array_elements(p_segments)
    LOOP
      v_proto := v_seg->>'protocol';
      v_mins := COALESCE((v_seg->>'duration_mins')::BIGINT, 0);
      IF v_mins < 1 THEN
        CONTINUE;
      END IF;
      v_total_mins := v_total_mins + v_mins;
      IF v_proto = 'lockin' THEN
        v_lockin_delta := v_lockin_delta + v_mins;
      ELSIF v_proto = 'flow' THEN
        v_flow_delta := v_flow_delta + v_mins;
      ELSIF v_proto = 'reset' THEN
        v_reset_delta := v_reset_delta + v_mins;
      END IF;
    END LOOP;
  END IF;

  IF v_total_mins < 1 THEN
    IF p_duration_mins IS NULL OR p_duration_mins < 1 THEN
      RAISE EXCEPTION 'duration_mins must be at least 1';
    END IF;
    v_total_mins := p_duration_mins;
    IF p_coin_type = 'lockin' THEN
      v_lockin_delta := p_duration_mins;
    ELSIF p_coin_type = 'flow' THEN
      v_flow_delta := p_duration_mins;
    ELSE
      v_reset_delta := p_duration_mins;
    END IF;
  END IF;

  INSERT INTO public.sessions (
    user_id,
    started_at,
    coin_type,
    duration_mins,
    note,
    next_block,
    segments
  )
  VALUES (
    v_user_id,
    p_started_at,
    p_coin_type,
    v_total_mins,
    p_note,
    p_next_block,
    CASE
      WHEN p_segments IS NOT NULL AND jsonb_array_length(p_segments) > 0 THEN p_segments
      ELSE NULL
    END
  )
  RETURNING * INTO v_row;

  SELECT us.last_session_date, us.current_streak, us.longest_streak
  INTO v_last, v_streak, v_longest
  FROM public.user_stats AS us
  WHERE us.user_id = v_user_id;

  IF NOT FOUND THEN
    v_streak := 0;
    v_longest := 0;
    v_last := NULL;
  END IF;

  IF v_total_mins >= 5 THEN
    IF v_last = v_today THEN
      NULL;
    ELSIF v_last = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
    ELSE
      v_streak := 1;
    END IF;
    v_longest := GREATEST(COALESCE(v_longest, 0), v_streak);
  END IF;

  INSERT INTO public.user_stats (
    user_id,
    current_streak,
    longest_streak,
    last_session_date,
    total_lockin_mins,
    total_flow_mins,
    total_reset_mins,
    updated_at
  )
  VALUES (
    v_user_id,
    CASE WHEN v_total_mins >= 5 THEN v_streak ELSE COALESCE(v_streak, 0) END,
    CASE WHEN v_total_mins >= 5 THEN v_longest ELSE COALESCE(v_longest, 0) END,
    CASE WHEN v_total_mins >= 5 THEN v_today ELSE v_last END,
    v_lockin_delta,
    v_flow_delta,
    v_reset_delta,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_streak = CASE
      WHEN v_total_mins >= 5 THEN EXCLUDED.current_streak
      ELSE public.user_stats.current_streak
    END,
    longest_streak = CASE
      WHEN v_total_mins >= 5 THEN EXCLUDED.longest_streak
      ELSE public.user_stats.longest_streak
    END,
    last_session_date = CASE
      WHEN v_total_mins >= 5 THEN EXCLUDED.last_session_date
      ELSE public.user_stats.last_session_date
    END,
    total_lockin_mins = public.user_stats.total_lockin_mins + v_lockin_delta,
    total_flow_mins = public.user_stats.total_flow_mins + v_flow_delta,
    total_reset_mins = public.user_stats.total_reset_mins + v_reset_delta,
    updated_at = now();

  RETURN QUERY
  SELECT v_row.id, COALESCE(v_streak, 0), COALESCE(v_longest, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_session(
  public.coin_type,
  TIMESTAMPTZ,
  BIGINT,
  TEXT,
  TEXT,
  JSONB
) TO authenticated;


-- ============================================================
-- 006_flow_session_focus_duration.sql
-- ============================================================
-- FLOW↔RESET chains: sessions.duration_mins = focus (FLOW) minutes; stats still sum all segments.

CREATE OR REPLACE FUNCTION public.complete_session(
  p_coin_type public.coin_type,
  p_started_at TIMESTAMPTZ,
  p_duration_mins BIGINT,
  p_note TEXT DEFAULT NULL,
  p_next_block TEXT DEFAULT NULL,
  p_segments JSONB DEFAULT NULL
)
RETURNS TABLE (
  out_session_id UUID,
  out_current_streak INT,
  out_longest_streak INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (timezone('utc', now()))::date;
  v_last DATE;
  v_streak INT;
  v_longest INT;
  v_row public.sessions;
  v_lockin_delta BIGINT := 0;
  v_flow_delta BIGINT := 0;
  v_reset_delta BIGINT := 0;
  v_total_mins BIGINT;
  v_row_duration BIGINT;
  v_seg JSONB;
  v_proto TEXT;
  v_mins BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_total_mins := 0;
  v_lockin_delta := 0;
  v_flow_delta := 0;
  v_reset_delta := 0;

  IF p_segments IS NOT NULL AND jsonb_array_length(p_segments) > 0 THEN
    FOR v_seg IN SELECT value FROM jsonb_array_elements(p_segments)
    LOOP
      v_proto := v_seg->>'protocol';
      v_mins := COALESCE((v_seg->>'duration_mins')::BIGINT, 0);
      IF v_mins < 1 THEN
        CONTINUE;
      END IF;
      v_total_mins := v_total_mins + v_mins;
      IF v_proto = 'lockin' THEN
        v_lockin_delta := v_lockin_delta + v_mins;
      ELSIF v_proto = 'flow' THEN
        v_flow_delta := v_flow_delta + v_mins;
      ELSIF v_proto = 'reset' THEN
        v_reset_delta := v_reset_delta + v_mins;
      END IF;
    END LOOP;
  END IF;

  IF v_total_mins < 1 THEN
    IF p_duration_mins IS NULL OR p_duration_mins < 1 THEN
      RAISE EXCEPTION 'duration_mins must be at least 1';
    END IF;
    v_total_mins := p_duration_mins;
    v_row_duration := p_duration_mins;
    IF p_coin_type = 'lockin' THEN
      v_lockin_delta := p_duration_mins;
    ELSIF p_coin_type = 'flow' THEN
      v_flow_delta := p_duration_mins;
    ELSE
      v_reset_delta := p_duration_mins;
    END IF;
  ELSIF p_coin_type = 'flow' AND v_flow_delta >= 1 THEN
    v_row_duration := v_flow_delta;
  ELSE
    v_row_duration := v_total_mins;
  END IF;

  INSERT INTO public.sessions (
    user_id,
    started_at,
    coin_type,
    duration_mins,
    note,
    next_block,
    segments
  )
  VALUES (
    v_user_id,
    p_started_at,
    p_coin_type,
    v_row_duration,
    p_note,
    p_next_block,
    CASE
      WHEN p_segments IS NOT NULL AND jsonb_array_length(p_segments) > 0 THEN p_segments
      ELSE NULL
    END
  )
  RETURNING * INTO v_row;

  SELECT us.last_session_date, us.current_streak, us.longest_streak
  INTO v_last, v_streak, v_longest
  FROM public.user_stats AS us
  WHERE us.user_id = v_user_id;

  IF NOT FOUND THEN
    v_streak := 0;
    v_longest := 0;
    v_last := NULL;
  END IF;

  IF v_row_duration >= 5 THEN
    IF v_last = v_today THEN
      NULL;
    ELSIF v_last = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
    ELSE
      v_streak := 1;
    END IF;
    v_longest := GREATEST(COALESCE(v_longest, 0), v_streak);
  END IF;

  INSERT INTO public.user_stats (
    user_id,
    current_streak,
    longest_streak,
    last_session_date,
    total_lockin_mins,
    total_flow_mins,
    total_reset_mins,
    updated_at
  )
  VALUES (
    v_user_id,
    CASE WHEN v_row_duration >= 5 THEN v_streak ELSE COALESCE(v_streak, 0) END,
    CASE WHEN v_row_duration >= 5 THEN v_longest ELSE COALESCE(v_longest, 0) END,
    CASE WHEN v_row_duration >= 5 THEN v_today ELSE v_last END,
    v_lockin_delta,
    v_flow_delta,
    v_reset_delta,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_streak = CASE
      WHEN v_row_duration >= 5 THEN EXCLUDED.current_streak
      ELSE public.user_stats.current_streak
    END,
    longest_streak = CASE
      WHEN v_row_duration >= 5 THEN EXCLUDED.longest_streak
      ELSE public.user_stats.longest_streak
    END,
    last_session_date = CASE
      WHEN v_row_duration >= 5 THEN EXCLUDED.last_session_date
      ELSE public.user_stats.last_session_date
    END,
    total_lockin_mins = public.user_stats.total_lockin_mins + v_lockin_delta,
    total_flow_mins = public.user_stats.total_flow_mins + v_flow_delta,
    total_reset_mins = public.user_stats.total_reset_mins + v_reset_delta,
    updated_at = now();

  RETURN QUERY
  SELECT v_row.id, COALESCE(v_streak, 0), COALESCE(v_longest, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_session(
  public.coin_type,
  TIMESTAMPTZ,
  BIGINT,
  TEXT,
  TEXT,
  JSONB
) TO authenticated;


-- ============================================================
-- 007_history_limit.sql
-- ============================================================
-- Raise session history RPC cap for 90-day activity calendar.

CREATE OR REPLACE FUNCTION public.get_my_session_history(p_limit INT DEFAULT 50)
RETURNS SETOF public.sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.sessions
  WHERE user_id = auth.uid()
  ORDER BY started_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.get_my_session_history TO authenticated;


-- ============================================================
-- 008_streak_local_date.sql
-- ============================================================
-- Streak uses device local calendar date (p_streak_date) instead of UTC now().
-- Adds sync_my_streak for client backfill and recompute_my_streak_from_sessions for repair.

CREATE OR REPLACE FUNCTION public.complete_session(
  p_coin_type public.coin_type,
  p_started_at TIMESTAMPTZ,
  p_duration_mins BIGINT,
  p_note TEXT DEFAULT NULL,
  p_next_block TEXT DEFAULT NULL,
  p_segments JSONB DEFAULT NULL,
  p_streak_date DATE DEFAULT NULL
)
RETURNS TABLE (
  out_session_id UUID,
  out_current_streak INT,
  out_longest_streak INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := COALESCE(p_streak_date, (timezone('utc', now()))::date);
  v_last DATE;
  v_streak INT;
  v_longest INT;
  v_row public.sessions;
  v_lockin_delta BIGINT := 0;
  v_flow_delta BIGINT := 0;
  v_reset_delta BIGINT := 0;
  v_total_mins BIGINT;
  v_row_duration BIGINT;
  v_seg JSONB;
  v_proto TEXT;
  v_mins BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_total_mins := 0;
  v_lockin_delta := 0;
  v_flow_delta := 0;
  v_reset_delta := 0;

  IF p_segments IS NOT NULL AND jsonb_array_length(p_segments) > 0 THEN
    FOR v_seg IN SELECT value FROM jsonb_array_elements(p_segments)
    LOOP
      v_proto := v_seg->>'protocol';
      v_mins := COALESCE((v_seg->>'duration_mins')::BIGINT, 0);
      IF v_mins < 1 THEN
        CONTINUE;
      END IF;
      v_total_mins := v_total_mins + v_mins;
      IF v_proto = 'lockin' THEN
        v_lockin_delta := v_lockin_delta + v_mins;
      ELSIF v_proto = 'flow' THEN
        v_flow_delta := v_flow_delta + v_mins;
      ELSIF v_proto = 'reset' THEN
        v_reset_delta := v_reset_delta + v_mins;
      END IF;
    END LOOP;
  END IF;

  IF v_total_mins < 1 THEN
    IF p_duration_mins IS NULL OR p_duration_mins < 1 THEN
      RAISE EXCEPTION 'duration_mins must be at least 1';
    END IF;
    v_total_mins := p_duration_mins;
    v_row_duration := p_duration_mins;
    IF p_coin_type = 'lockin' THEN
      v_lockin_delta := p_duration_mins;
    ELSIF p_coin_type = 'flow' THEN
      v_flow_delta := p_duration_mins;
    ELSE
      v_reset_delta := p_duration_mins;
    END IF;
  ELSIF p_coin_type = 'flow' AND v_flow_delta >= 1 THEN
    v_row_duration := v_flow_delta;
  ELSE
    v_row_duration := v_total_mins;
  END IF;

  INSERT INTO public.sessions (
    user_id,
    started_at,
    coin_type,
    duration_mins,
    note,
    next_block,
    segments
  )
  VALUES (
    v_user_id,
    p_started_at,
    p_coin_type,
    v_row_duration,
    p_note,
    p_next_block,
    CASE
      WHEN p_segments IS NOT NULL AND jsonb_array_length(p_segments) > 0 THEN p_segments
      ELSE NULL
    END
  )
  RETURNING * INTO v_row;

  SELECT us.last_session_date, us.current_streak, us.longest_streak
  INTO v_last, v_streak, v_longest
  FROM public.user_stats AS us
  WHERE us.user_id = v_user_id;

  IF NOT FOUND THEN
    v_streak := 0;
    v_longest := 0;
    v_last := NULL;
  END IF;

  IF v_row_duration >= 5 THEN
    IF v_last = v_today THEN
      NULL;
    ELSIF v_last = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
    ELSE
      v_streak := 1;
    END IF;
    v_longest := GREATEST(COALESCE(v_longest, 0), v_streak);
  END IF;

  INSERT INTO public.user_stats (
    user_id,
    current_streak,
    longest_streak,
    last_session_date,
    total_lockin_mins,
    total_flow_mins,
    total_reset_mins,
    updated_at
  )
  VALUES (
    v_user_id,
    CASE WHEN v_row_duration >= 5 THEN v_streak ELSE COALESCE(v_streak, 0) END,
    CASE WHEN v_row_duration >= 5 THEN v_longest ELSE COALESCE(v_longest, 0) END,
    CASE WHEN v_row_duration >= 5 THEN v_today ELSE v_last END,
    v_lockin_delta,
    v_flow_delta,
    v_reset_delta,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_streak = CASE
      WHEN v_row_duration >= 5 THEN EXCLUDED.current_streak
      ELSE public.user_stats.current_streak
    END,
    longest_streak = CASE
      WHEN v_row_duration >= 5 THEN EXCLUDED.longest_streak
      ELSE public.user_stats.longest_streak
    END,
    last_session_date = CASE
      WHEN v_row_duration >= 5 THEN EXCLUDED.last_session_date
      ELSE public.user_stats.last_session_date
    END,
    total_lockin_mins = public.user_stats.total_lockin_mins + v_lockin_delta,
    total_flow_mins = public.user_stats.total_flow_mins + v_flow_delta,
    total_reset_mins = public.user_stats.total_reset_mins + v_reset_delta,
    updated_at = now();

  RETURN QUERY
  SELECT v_row.id, COALESCE(v_streak, 0), COALESCE(v_longest, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_session(
  public.coin_type,
  TIMESTAMPTZ,
  BIGINT,
  TEXT,
  TEXT,
  JSONB,
  DATE
) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_my_streak(
  p_current_streak INT,
  p_longest_streak INT,
  p_last_qualifying_date DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_stats (
    user_id,
    current_streak,
    longest_streak,
    last_session_date,
    updated_at
  )
  VALUES (
    v_user_id,
    GREATEST(0, COALESCE(p_current_streak, 0)),
    GREATEST(0, COALESCE(p_longest_streak, 0)),
    p_last_qualifying_date,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_streak = GREATEST(0, COALESCE(p_current_streak, 0)),
    longest_streak = GREATEST(
      public.user_stats.longest_streak,
      GREATEST(0, COALESCE(p_longest_streak, 0))
    ),
    last_session_date = COALESCE(p_last_qualifying_date, public.user_stats.last_session_date),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_my_streak(INT, INT, DATE) TO authenticated;

-- Repair streak columns from session rows (UTC session dates; optional server-side repair).
CREATE OR REPLACE FUNCTION public.recompute_my_streak_from_sessions()
RETURNS TABLE (
  out_current_streak INT,
  out_longest_streak INT,
  out_last_qualifying_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_prev_day DATE;
  v_run INT := 0;
  v_longest INT := 0;
  v_current INT := 0;
  v_last_qual DATE;
  v_today DATE := (timezone('utc', now()))::date;
  v_yesterday DATE := v_today - 1;
  v_anchor DATE;
  v_cursor DATE;
  rec RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  CREATE TEMP TABLE tmp_streak_days ON COMMIT DROP AS
  SELECT (s.started_at AT TIME ZONE 'UTC')::date AS day
  FROM public.sessions AS s
  WHERE s.user_id = v_user_id
  GROUP BY 1
  HAVING SUM(
    CASE
      WHEN s.coin_type IN ('lockin', 'flow') THEN s.duration_mins
      ELSE 0
    END
  ) >= 5
  ORDER BY 1;

  v_prev_day := NULL;
  v_run := 0;
  FOR rec IN SELECT day FROM tmp_streak_days ORDER BY day
  LOOP
    IF v_prev_day IS NOT NULL AND rec.day = v_prev_day + 1 THEN
      v_run := v_run + 1;
    ELSE
      v_run := 1;
    END IF;
    v_longest := GREATEST(v_longest, v_run);
    v_prev_day := rec.day;
    v_last_qual := rec.day;
  END LOOP;

  IF EXISTS (SELECT 1 FROM tmp_streak_days WHERE day = v_today) THEN
    v_anchor := v_today;
  ELSIF EXISTS (SELECT 1 FROM tmp_streak_days WHERE day = v_yesterday) THEN
    v_anchor := v_yesterday;
  ELSE
    v_anchor := NULL;
  END IF;

  IF v_anchor IS NOT NULL THEN
    v_cursor := v_anchor;
    WHILE EXISTS (SELECT 1 FROM tmp_streak_days WHERE day = v_cursor)
    LOOP
      v_current := v_current + 1;
      v_cursor := v_cursor - 1;
    END LOOP;
  END IF;

  UPDATE public.user_stats
  SET
    current_streak = v_current,
    longest_streak = GREATEST(COALESCE(longest_streak, 0), v_longest),
    last_session_date = v_last_qual,
    updated_at = now()
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_stats (
      user_id,
      current_streak,
      longest_streak,
      last_session_date,
      updated_at
    )
    VALUES (v_user_id, v_current, v_longest, v_last_qual, now());
  END IF;

  RETURN QUERY SELECT v_current, v_longest, v_last_qual;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_my_streak_from_sessions() TO authenticated;


-- ============================================================
-- 009_resolve_coin_for_session.sql
-- ============================================================
-- Resolve a tapped NFC coin to its session type for the current user.
-- Returns the coin_type only when the coin_id is active and owned by the
-- authenticated caller; returns NULL otherwise (unregistered or owned by
-- another account). Used by the live coin-tap-to-session flow.

CREATE OR REPLACE FUNCTION public.resolve_coin_for_session(p_coin_id TEXT)
RETURNS public.coin_type
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_type public.coin_type;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT coin_type INTO v_type
  FROM public.coins
  WHERE coin_id = p_coin_id
    AND user_id = v_user_id
    AND active = true;

  RETURN v_type;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_coin_for_session TO authenticated;


-- ============================================================
-- 010_strict_coin_registration.sql
-- ============================================================
-- Strict coin registration for NDEF-aware Settings registration.
-- Unlike register_coin, this does not silently replace a user's existing coin
-- for the same protocol type. Users must delete the old coin first.

CREATE OR REPLACE FUNCTION public.register_coin_strict(
  p_coin_id TEXT,
  p_coin_type public.coin_type
)
RETURNS public.coins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_coin public.coins;
  v_existing_type public.coins;
  v_row public.coins;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_existing_coin
  FROM public.coins
  WHERE coin_id = p_coin_id
    AND active = true;

  IF FOUND THEN
    IF v_existing_coin.user_id <> v_user_id THEN
      RAISE EXCEPTION 'This coin is already linked to another account'
        USING ERRCODE = 'unique_violation';
    END IF;

    IF v_existing_coin.coin_type <> p_coin_type THEN
      RAISE EXCEPTION 'This coin is already registered as %. Delete it before registering as %.',
        v_existing_coin.coin_type,
        p_coin_type
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN v_existing_coin;
  END IF;

  SELECT * INTO v_existing_type
  FROM public.coins
  WHERE user_id = v_user_id
    AND coin_type = p_coin_type
    AND active = true;

  IF FOUND THEN
    RAISE EXCEPTION 'You already have an active % coin. Delete it before registering another one.',
      p_coin_type
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.coins (coin_id, user_id, coin_type, active)
  VALUES (p_coin_id, v_user_id, p_coin_type, true)
  ON CONFLICT (coin_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      coin_type = EXCLUDED.coin_type,
      active = true,
      registered_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_coin(p_coin_id TEXT)
RETURNS public.coins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.coins;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.coins
  SET active = false
  WHERE coin_id = p_coin_id
    AND user_id = v_user_id
    AND active = true
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coin not found';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_coin_strict TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_coin TO authenticated;


-- ============================================================
-- 011_squad.sql
-- ============================================================
-- Squad tab: friend codes, friend links (request → accept), and the shared
-- activity status friends read when they open the tab.
--
-- Also creates public.profiles. It was previously made by hand in the Supabase
-- dashboard and never captured in a migration, so a project rebuilt from
-- migrations alone came up without it and the app broke on sign-in. Everything
-- here is idempotent so it is safe to run against an existing project.

-- ---------------------------------------------------------------------------
-- profiles (backfilled from the dashboard-only definition)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS profiles_upsert_own ON public.profiles;
CREATE POLICY profiles_upsert_own ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Friend codes
-- ---------------------------------------------------------------------------

-- Six characters, no vowels (avoids real words) and no 0/O/1/I/L (avoids
-- transcription mistakes when the code is read aloud or off a screen).
CREATE OR REPLACE FUNCTION public.generate_friend_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '23456789BCDFGHJKMNPQRSTVWXYZ';
  v_code TEXT;
  v_attempt INT := 0;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE friend_code = v_code);

    v_attempt := v_attempt + 1;
    IF v_attempt > 50 THEN
      RAISE EXCEPTION 'Could not allocate a unique friend code';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS friend_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_friend_code_idx
  ON public.profiles (friend_code)
  WHERE friend_code IS NOT NULL;

-- Existing accounts predate friend codes; give them one now.
UPDATE public.profiles
SET friend_code = public.generate_friend_code()
WHERE friend_code IS NULL;

-- Every new profile row gets a code without the client having to ask.
CREATE OR REPLACE FUNCTION public.profiles_set_friend_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.friend_code IS NULL THEN
    NEW.friend_code := public.generate_friend_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_friend_code_trigger ON public.profiles;
CREATE TRIGGER profiles_friend_code_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_set_friend_code();

-- RLS is row-level, but friend_code needs COLUMN-level protection: the
-- leaderboard has to read every user's username, and a blanket SELECT would
-- hand out everyone's code along with it — anyone could then request anyone.
-- Column privileges apply on top of RLS, so clients keep reading usernames
-- while friend_code stays reachable only through the SECURITY DEFINER RPCs.
-- Restricting UPDATE the same way is what makes the code un-editable by users.
REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT SELECT (id, username, created_at) ON public.profiles TO authenticated;
GRANT INSERT (id, username) ON public.profiles TO authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;

-- The client calls this once at sign-in. It covers users who signed up before
-- this migration and users whose profile row was created some other way.
-- The friend code is never user-editable — this is the only way one is issued.
CREATE OR REPLACE FUNCTION public.ensure_my_friend_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (v_user_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT friend_code INTO v_code FROM public.profiles WHERE id = v_user_id;

  IF v_code IS NULL THEN
    v_code := public.generate_friend_code();
    UPDATE public.profiles SET friend_code = v_code WHERE id = v_user_id;
  END IF;

  RETURN v_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- Friend links
-- ---------------------------------------------------------------------------

-- One row per relationship in either state. user_a is always the smaller UUID
-- so a pair can only ever have one row, whichever direction it was started in.
CREATE TABLE IF NOT EXISTS public.friend_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT friend_links_ordered CHECK (user_a < user_b),
  CONSTRAINT friend_links_unique UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS friend_links_user_a_idx ON public.friend_links (user_a);
CREATE INDEX IF NOT EXISTS friend_links_user_b_idx ON public.friend_links (user_b);

ALTER TABLE public.friend_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friend_links_select_own ON public.friend_links;
CREATE POLICY friend_links_select_own ON public.friend_links
  FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Writes go through the RPCs below (SECURITY DEFINER), so no INSERT/UPDATE/
-- DELETE policy is granted: a client cannot forge a link or accept on someone
-- else's behalf.

CREATE OR REPLACE FUNCTION public.are_friends(p_one UUID, p_two UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friend_links
    WHERE status = 'accepted'
      AND user_a = LEAST(p_one, p_two)
      AND user_b = GREATEST(p_one, p_two)
  );
$$;

-- ---------------------------------------------------------------------------
-- Shared activity status
-- ---------------------------------------------------------------------------

-- Derived from what the user is actually doing, not from an open socket: a
-- phone that is face-down mid-block must still read as "locked in".
DO $$ BEGIN
  CREATE TYPE public.activity_state AS ENUM ('offline', 'lockin', 'flow', 'paused');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  state public.activity_state NOT NULL DEFAULT 'offline',
  -- Start of the current block (or of the pause). Elapsed time is computed on
  -- the client from this, so the tab does not need to poll to keep a timer moving.
  started_at TIMESTAMPTZ,
  -- Start of the whole shift, so a friend can see how long the chain has run.
  shift_started_at TIMESTAMPTZ,
  -- Completed blocks of the current shift: [{"protocol":"lockin","duration_mins":50}]
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_status_select_own ON public.user_status;
CREATE POLICY user_status_select_own ON public.user_status
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Accepted friends only. Nobody else can read what you are doing.
DROP POLICY IF EXISTS user_status_select_friends ON public.user_status;
CREATE POLICY user_status_select_friends ON public.user_status
  FOR SELECT TO authenticated
  USING (public.are_friends(auth.uid(), user_id));

DROP POLICY IF EXISTS user_status_write_own ON public.user_status;
CREATE POLICY user_status_write_own ON public.user_status
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Called on every block start, pause, resume and end.
CREATE OR REPLACE FUNCTION public.set_my_status(
  p_state public.activity_state,
  p_started_at TIMESTAMPTZ DEFAULT NULL,
  p_shift_started_at TIMESTAMPTZ DEFAULT NULL,
  p_blocks JSONB DEFAULT '[]'::jsonb
)
RETURNS public.user_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.user_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_status (user_id, state, started_at, shift_started_at, blocks, updated_at)
  VALUES (
    v_user_id,
    p_state,
    CASE WHEN p_state = 'offline' THEN NULL ELSE COALESCE(p_started_at, now()) END,
    CASE WHEN p_state = 'offline' THEN NULL ELSE p_shift_started_at END,
    CASE WHEN p_state = 'offline' THEN '[]'::jsonb ELSE COALESCE(p_blocks, '[]'::jsonb) END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET state = EXCLUDED.state,
      started_at = EXCLUDED.started_at,
      shift_started_at = EXCLUDED.shift_started_at,
      blocks = EXCLUDED.blocks,
      updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Squad RPCs
-- ---------------------------------------------------------------------------

-- Look up by code and create the request in one call, so the client never has
-- to read the profiles table to resolve a stranger's code to a user id.
CREATE OR REPLACE FUNCTION public.send_friend_request(p_friend_code TEXT)
RETURNS public.friend_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_target UUID;
  v_code TEXT := upper(regexp_replace(COALESCE(p_friend_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_existing public.friend_links;
  v_row public.friend_links;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Enter a friend code';
  END IF;

  SELECT id INTO v_target FROM public.profiles WHERE friend_code = v_code;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No one uses that code';
  END IF;

  IF v_target = v_user_id THEN
    RAISE EXCEPTION 'That is your own code';
  END IF;

  SELECT * INTO v_existing
  FROM public.friend_links
  WHERE user_a = LEAST(v_user_id, v_target)
    AND user_b = GREATEST(v_user_id, v_target);

  IF FOUND THEN
    IF v_existing.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already squad';
    END IF;

    -- They already asked you: entering their code accepts it.
    IF v_existing.requested_by = v_target THEN
      UPDATE public.friend_links
      SET status = 'accepted', responded_at = now()
      WHERE id = v_existing.id
      RETURNING * INTO v_row;
      RETURN v_row;
    END IF;

    RAISE EXCEPTION 'Request already sent';
  END IF;

  INSERT INTO public.friend_links (user_a, user_b, requested_by, status)
  VALUES (LEAST(v_user_id, v_target), GREATEST(v_user_id, v_target), v_user_id, 'pending')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Accept or decline. Declining deletes the row so the sender can try again later.
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(
  p_link_id UUID,
  p_accept BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_link public.friend_links;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_link FROM public.friend_links WHERE id = p_link_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_user_id NOT IN (v_link.user_a, v_link.user_b) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- Only the recipient may answer.
  IF v_link.requested_by = v_user_id THEN
    RAISE EXCEPTION 'You sent this request';
  END IF;

  IF v_link.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already answered';
  END IF;

  IF p_accept THEN
    UPDATE public.friend_links
    SET status = 'accepted', responded_at = now()
    WHERE id = p_link_id;
  ELSE
    DELETE FROM public.friend_links WHERE id = p_link_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- Removing a friend and cancelling a request you sent are the same operation.
CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.friend_links
  WHERE user_a = LEAST(v_user_id, p_friend_id)
    AND user_b = GREATEST(v_user_id, p_friend_id);

  RETURN TRUE;
END;
$$;

-- Everything the Squad tab renders, in one round trip: my code, my friends and
-- their live state, requests waiting on me, and requests waiting on them.
CREATE OR REPLACE FUNCTION public.get_my_squad()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_build_object(
    'my_code', (SELECT friend_code FROM public.profiles WHERE id = v_user_id),

    'friends', COALESCE((
      SELECT jsonb_agg(f ORDER BY f->>'username')
      FROM (
        SELECT jsonb_build_object(
          'link_id', l.id,
          'user_id', p.id,
          'username', p.username,
          'state', COALESCE(s.state::text, 'offline'),
          'started_at', s.started_at,
          'shift_started_at', s.shift_started_at,
          'blocks', COALESCE(s.blocks, '[]'::jsonb),
          'since', l.responded_at
        ) AS f
        FROM public.friend_links l
        JOIN public.profiles p
          ON p.id = CASE WHEN l.user_a = v_user_id THEN l.user_b ELSE l.user_a END
        LEFT JOIN public.user_status s ON s.user_id = p.id
        WHERE l.status = 'accepted'
          AND v_user_id IN (l.user_a, l.user_b)
      ) friends_sub
    ), '[]'::jsonb),

    -- Waiting on me to answer.
    'incoming', COALESCE((
      SELECT jsonb_agg(r ORDER BY r->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'link_id', l.id,
          'user_id', p.id,
          'username', p.username,
          'created_at', l.created_at
        ) AS r
        FROM public.friend_links l
        JOIN public.profiles p ON p.id = l.requested_by
        WHERE l.status = 'pending'
          AND l.requested_by <> v_user_id
          AND v_user_id IN (l.user_a, l.user_b)
      ) incoming_sub
    ), '[]'::jsonb),

    -- Waiting on them.
    'outgoing', COALESCE((
      SELECT jsonb_agg(r ORDER BY r->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'link_id', l.id,
          'user_id', p.id,
          'username', p.username,
          'created_at', l.created_at
        ) AS r
        FROM public.friend_links l
        JOIN public.profiles p
          ON p.id = CASE WHEN l.user_a = v_user_id THEN l.user_b ELSE l.user_a END
        WHERE l.status = 'pending'
          AND l.requested_by = v_user_id
          AND v_user_id IN (l.user_a, l.user_b)
      ) outgoing_sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_friend_code TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_squad TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends TO authenticated;


-- ============================================================
-- 012_shifts_and_xp.sql
-- ============================================================
-- Shift system and XP.
--
-- A Shift is a chain of blocks (Lock In → Reset → Flow → …). XP accrues
-- silently while the shift is open and is only written to the profile when the
-- user formally ends it — that commit is what unlocks the Grand Finale screen.
--
-- Idempotent: safe to run against an existing project.

-- ---------------------------------------------------------------------------
-- Lifetime XP lives on user_stats, alongside the other running totals.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS total_xp BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overtime_mins BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_shifts BIGINT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.shift_end_reason AS ENUM ('end_shift', 'exit', 'auto');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'end_shift' earns the Grand Finale. 'exit' is the always-available escape
  -- hatch; it still banks the XP (no penalty) but shows no reward screen.
  -- 'auto' is a shift the client closed after inactivity.
  ended_reason public.shift_end_reason NOT NULL DEFAULT 'end_shift',
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  focus_mins BIGINT NOT NULL DEFAULT 0,
  overtime_mins BIGINT NOT NULL DEFAULT 0,
  block_count INT NOT NULL DEFAULT 0,
  lockin_xp BIGINT NOT NULL DEFAULT 0,
  flow_xp BIGINT NOT NULL DEFAULT 0,
  overtime_bonus_xp BIGINT NOT NULL DEFAULT 0,
  total_xp BIGINT NOT NULL DEFAULT 0,
  -- "First target for tomorrow?" from the End Shift prompt.
  next_target TEXT
);

CREATE INDEX IF NOT EXISTS shifts_user_ended_idx
  ON public.shifts (user_id, ended_at DESC);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shifts_select_own ON public.shifts;
CREATE POLICY shifts_select_own ON public.shifts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Inserts go through end_shift() so XP can never be self-reported.
REVOKE INSERT, UPDATE, DELETE ON public.shifts FROM authenticated;

-- ---------------------------------------------------------------------------
-- Commit a finished shift
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.end_shift(
  p_started_at TIMESTAMPTZ,
  p_blocks JSONB,
  p_focus_mins BIGINT,
  p_overtime_mins BIGINT,
  p_block_count INT,
  p_lockin_xp BIGINT,
  p_flow_xp BIGINT,
  p_overtime_bonus_xp BIGINT,
  p_total_xp BIGINT,
  p_next_target TEXT DEFAULT NULL,
  p_ended_reason public.shift_end_reason DEFAULT 'end_shift'
)
RETURNS TABLE (
  out_shift_id UUID,
  out_total_xp BIGINT,
  out_lifetime_xp BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_shift_id UUID;
  v_lifetime BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Clamp to non-negative: a client clock glitch must not subtract XP.
  INSERT INTO public.shifts (
    user_id, started_at, ended_at, ended_reason, blocks,
    focus_mins, overtime_mins, block_count,
    lockin_xp, flow_xp, overtime_bonus_xp, total_xp, next_target
  ) VALUES (
    v_user_id, p_started_at, now(), p_ended_reason, COALESCE(p_blocks, '[]'::jsonb),
    GREATEST(0, COALESCE(p_focus_mins, 0)),
    GREATEST(0, COALESCE(p_overtime_mins, 0)),
    GREATEST(0, COALESCE(p_block_count, 0)),
    GREATEST(0, COALESCE(p_lockin_xp, 0)),
    GREATEST(0, COALESCE(p_flow_xp, 0)),
    GREATEST(0, COALESCE(p_overtime_bonus_xp, 0)),
    GREATEST(0, COALESCE(p_total_xp, 0)),
    p_next_target
  )
  RETURNING id INTO v_shift_id;

  -- This is the moment XP becomes permanent.
  INSERT INTO public.user_stats (user_id, total_xp, total_overtime_mins, total_shifts, updated_at)
  VALUES (
    v_user_id,
    GREATEST(0, COALESCE(p_total_xp, 0)),
    GREATEST(0, COALESCE(p_overtime_mins, 0)),
    1,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET total_xp = public.user_stats.total_xp + GREATEST(0, COALESCE(p_total_xp, 0)),
      total_overtime_mins =
        public.user_stats.total_overtime_mins + GREATEST(0, COALESCE(p_overtime_mins, 0)),
      total_shifts = public.user_stats.total_shifts + 1,
      updated_at = now()
  RETURNING public.user_stats.total_xp INTO v_lifetime;

  RETURN QUERY SELECT v_shift_id, GREATEST(0, COALESCE(p_total_xp, 0))::BIGINT, v_lifetime;
END;
$$;

-- Lifetime XP for the main page. Returns zeros rather than nothing for a user
-- who has not finished a shift yet.
CREATE OR REPLACE FUNCTION public.get_my_xp()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.user_stats;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.user_stats WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'total_xp', COALESCE(v_row.total_xp, 0),
    'total_shifts', COALESCE(v_row.total_shifts, 0),
    'total_overtime_mins', COALESCE(v_row.total_overtime_mins, 0),
    'current_streak', COALESCE(v_row.current_streak, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_shift TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_xp TO authenticated;


-- ============================================================
-- 013_set_username.sql
-- ============================================================
-- Setting a username has to go through an RPC, not a client-side upsert.
--
-- Migration 011 locked profiles down to column-level grants so friend_code
-- could not be read or edited by clients. That had an unintended consequence:
-- PostgREST's upsert writes every column in the payload (id AND username), and
-- the ON CONFLICT branch then needs UPDATE on `id`, which is not granted. The
-- result was `42501: permission denied for table profiles` — every new account
-- reached "Choose a username" and could never get past it.
--
-- Rather than widen the grants, usernames now go through a SECURITY DEFINER
-- function, matching how every other write in this schema works.

CREATE OR REPLACE FUNCTION public.set_my_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean TEXT := trim(COALESCE(p_username, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF length(v_clean) < 3 THEN
    RAISE EXCEPTION 'Username must be at least 3 characters';
  END IF;

  IF length(v_clean) > 24 THEN
    RAISE EXCEPTION 'Username must be 24 characters or fewer';
  END IF;

  -- Someone else already holds it. Checked explicitly so the caller gets a
  -- readable message instead of a raw unique-violation.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(v_clean) AND id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'That username is taken';
  END IF;

  -- The row may not exist yet for an account created before profiles did.
  INSERT INTO public.profiles (id, username)
  VALUES (v_user_id, v_clean)
  ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username;

  RETURN v_clean;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_username TO authenticated;

