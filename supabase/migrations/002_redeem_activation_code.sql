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
