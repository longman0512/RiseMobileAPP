-- Redeem an activation code for the authenticated user.
-- Run in Supabase SQL editor or via CLI.

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
