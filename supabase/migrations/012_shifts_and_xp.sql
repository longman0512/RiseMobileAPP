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
