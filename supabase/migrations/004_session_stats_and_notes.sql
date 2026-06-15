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
