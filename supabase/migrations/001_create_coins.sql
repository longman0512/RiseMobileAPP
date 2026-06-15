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
