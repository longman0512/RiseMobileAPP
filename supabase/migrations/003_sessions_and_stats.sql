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
