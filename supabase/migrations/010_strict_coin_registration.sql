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
