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
