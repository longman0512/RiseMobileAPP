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
