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
