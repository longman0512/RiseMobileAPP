-- Squad tab: friend codes, friend links (request → accept), and the shared
-- activity status friends read when they open the tab.
--
-- Also creates public.profiles. It was previously made by hand in the Supabase
-- dashboard and never captured in a migration, so a project rebuilt from
-- migrations alone came up without it and the app broke on sign-in. Everything
-- here is idempotent so it is safe to run against an existing project.

-- ---------------------------------------------------------------------------
-- profiles (backfilled from the dashboard-only definition)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS profiles_upsert_own ON public.profiles;
CREATE POLICY profiles_upsert_own ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Friend codes
-- ---------------------------------------------------------------------------

-- Six characters, no vowels (avoids real words) and no 0/O/1/I/L (avoids
-- transcription mistakes when the code is read aloud or off a screen).
CREATE OR REPLACE FUNCTION public.generate_friend_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '23456789BCDFGHJKMNPQRSTVWXYZ';
  v_code TEXT;
  v_attempt INT := 0;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE friend_code = v_code);

    v_attempt := v_attempt + 1;
    IF v_attempt > 50 THEN
      RAISE EXCEPTION 'Could not allocate a unique friend code';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS friend_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_friend_code_idx
  ON public.profiles (friend_code)
  WHERE friend_code IS NOT NULL;

-- Existing accounts predate friend codes; give them one now.
UPDATE public.profiles
SET friend_code = public.generate_friend_code()
WHERE friend_code IS NULL;

-- Every new profile row gets a code without the client having to ask.
CREATE OR REPLACE FUNCTION public.profiles_set_friend_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.friend_code IS NULL THEN
    NEW.friend_code := public.generate_friend_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_friend_code_trigger ON public.profiles;
CREATE TRIGGER profiles_friend_code_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_set_friend_code();

-- RLS is row-level, but friend_code needs COLUMN-level protection: the
-- leaderboard has to read every user's username, and a blanket SELECT would
-- hand out everyone's code along with it — anyone could then request anyone.
-- Column privileges apply on top of RLS, so clients keep reading usernames
-- while friend_code stays reachable only through the SECURITY DEFINER RPCs.
-- Restricting UPDATE the same way is what makes the code un-editable by users.
REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT SELECT (id, username, created_at) ON public.profiles TO authenticated;
GRANT INSERT (id, username) ON public.profiles TO authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;

-- The client calls this once at sign-in. It covers users who signed up before
-- this migration and users whose profile row was created some other way.
-- The friend code is never user-editable — this is the only way one is issued.
CREATE OR REPLACE FUNCTION public.ensure_my_friend_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (v_user_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT friend_code INTO v_code FROM public.profiles WHERE id = v_user_id;

  IF v_code IS NULL THEN
    v_code := public.generate_friend_code();
    UPDATE public.profiles SET friend_code = v_code WHERE id = v_user_id;
  END IF;

  RETURN v_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- Friend links
-- ---------------------------------------------------------------------------

-- One row per relationship in either state. user_a is always the smaller UUID
-- so a pair can only ever have one row, whichever direction it was started in.
CREATE TABLE IF NOT EXISTS public.friend_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT friend_links_ordered CHECK (user_a < user_b),
  CONSTRAINT friend_links_unique UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS friend_links_user_a_idx ON public.friend_links (user_a);
CREATE INDEX IF NOT EXISTS friend_links_user_b_idx ON public.friend_links (user_b);

ALTER TABLE public.friend_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friend_links_select_own ON public.friend_links;
CREATE POLICY friend_links_select_own ON public.friend_links
  FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Writes go through the RPCs below (SECURITY DEFINER), so no INSERT/UPDATE/
-- DELETE policy is granted: a client cannot forge a link or accept on someone
-- else's behalf.

CREATE OR REPLACE FUNCTION public.are_friends(p_one UUID, p_two UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friend_links
    WHERE status = 'accepted'
      AND user_a = LEAST(p_one, p_two)
      AND user_b = GREATEST(p_one, p_two)
  );
$$;

-- ---------------------------------------------------------------------------
-- Shared activity status
-- ---------------------------------------------------------------------------

-- Derived from what the user is actually doing, not from an open socket: a
-- phone that is face-down mid-block must still read as "locked in".
DO $$ BEGIN
  CREATE TYPE public.activity_state AS ENUM ('offline', 'lockin', 'flow', 'paused');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  state public.activity_state NOT NULL DEFAULT 'offline',
  -- Start of the current block (or of the pause). Elapsed time is computed on
  -- the client from this, so the tab does not need to poll to keep a timer moving.
  started_at TIMESTAMPTZ,
  -- Start of the whole shift, so a friend can see how long the chain has run.
  shift_started_at TIMESTAMPTZ,
  -- Completed blocks of the current shift: [{"protocol":"lockin","duration_mins":50}]
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_status_select_own ON public.user_status;
CREATE POLICY user_status_select_own ON public.user_status
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Accepted friends only. Nobody else can read what you are doing.
DROP POLICY IF EXISTS user_status_select_friends ON public.user_status;
CREATE POLICY user_status_select_friends ON public.user_status
  FOR SELECT TO authenticated
  USING (public.are_friends(auth.uid(), user_id));

DROP POLICY IF EXISTS user_status_write_own ON public.user_status;
CREATE POLICY user_status_write_own ON public.user_status
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Called on every block start, pause, resume and end.
CREATE OR REPLACE FUNCTION public.set_my_status(
  p_state public.activity_state,
  p_started_at TIMESTAMPTZ DEFAULT NULL,
  p_shift_started_at TIMESTAMPTZ DEFAULT NULL,
  p_blocks JSONB DEFAULT '[]'::jsonb
)
RETURNS public.user_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.user_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_status (user_id, state, started_at, shift_started_at, blocks, updated_at)
  VALUES (
    v_user_id,
    p_state,
    CASE WHEN p_state = 'offline' THEN NULL ELSE COALESCE(p_started_at, now()) END,
    CASE WHEN p_state = 'offline' THEN NULL ELSE p_shift_started_at END,
    CASE WHEN p_state = 'offline' THEN '[]'::jsonb ELSE COALESCE(p_blocks, '[]'::jsonb) END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET state = EXCLUDED.state,
      started_at = EXCLUDED.started_at,
      shift_started_at = EXCLUDED.shift_started_at,
      blocks = EXCLUDED.blocks,
      updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Squad RPCs
-- ---------------------------------------------------------------------------

-- Look up by code and create the request in one call, so the client never has
-- to read the profiles table to resolve a stranger's code to a user id.
CREATE OR REPLACE FUNCTION public.send_friend_request(p_friend_code TEXT)
RETURNS public.friend_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_target UUID;
  v_code TEXT := upper(regexp_replace(COALESCE(p_friend_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_existing public.friend_links;
  v_row public.friend_links;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Enter a friend code';
  END IF;

  SELECT id INTO v_target FROM public.profiles WHERE friend_code = v_code;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No one uses that code';
  END IF;

  IF v_target = v_user_id THEN
    RAISE EXCEPTION 'That is your own code';
  END IF;

  SELECT * INTO v_existing
  FROM public.friend_links
  WHERE user_a = LEAST(v_user_id, v_target)
    AND user_b = GREATEST(v_user_id, v_target);

  IF FOUND THEN
    IF v_existing.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already squad';
    END IF;

    -- They already asked you: entering their code accepts it.
    IF v_existing.requested_by = v_target THEN
      UPDATE public.friend_links
      SET status = 'accepted', responded_at = now()
      WHERE id = v_existing.id
      RETURNING * INTO v_row;
      RETURN v_row;
    END IF;

    RAISE EXCEPTION 'Request already sent';
  END IF;

  INSERT INTO public.friend_links (user_a, user_b, requested_by, status)
  VALUES (LEAST(v_user_id, v_target), GREATEST(v_user_id, v_target), v_user_id, 'pending')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Accept or decline. Declining deletes the row so the sender can try again later.
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(
  p_link_id UUID,
  p_accept BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_link public.friend_links;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_link FROM public.friend_links WHERE id = p_link_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_user_id NOT IN (v_link.user_a, v_link.user_b) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- Only the recipient may answer.
  IF v_link.requested_by = v_user_id THEN
    RAISE EXCEPTION 'You sent this request';
  END IF;

  IF v_link.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already answered';
  END IF;

  IF p_accept THEN
    UPDATE public.friend_links
    SET status = 'accepted', responded_at = now()
    WHERE id = p_link_id;
  ELSE
    DELETE FROM public.friend_links WHERE id = p_link_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- Removing a friend and cancelling a request you sent are the same operation.
CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_id UUID)
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

  DELETE FROM public.friend_links
  WHERE user_a = LEAST(v_user_id, p_friend_id)
    AND user_b = GREATEST(v_user_id, p_friend_id);

  RETURN TRUE;
END;
$$;

-- Everything the Squad tab renders, in one round trip: my code, my friends and
-- their live state, requests waiting on me, and requests waiting on them.
CREATE OR REPLACE FUNCTION public.get_my_squad()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_build_object(
    'my_code', (SELECT friend_code FROM public.profiles WHERE id = v_user_id),

    'friends', COALESCE((
      SELECT jsonb_agg(f ORDER BY f->>'username')
      FROM (
        SELECT jsonb_build_object(
          'link_id', l.id,
          'user_id', p.id,
          'username', p.username,
          'state', COALESCE(s.state::text, 'offline'),
          'started_at', s.started_at,
          'shift_started_at', s.shift_started_at,
          'blocks', COALESCE(s.blocks, '[]'::jsonb),
          'since', l.responded_at
        ) AS f
        FROM public.friend_links l
        JOIN public.profiles p
          ON p.id = CASE WHEN l.user_a = v_user_id THEN l.user_b ELSE l.user_a END
        LEFT JOIN public.user_status s ON s.user_id = p.id
        WHERE l.status = 'accepted'
          AND v_user_id IN (l.user_a, l.user_b)
      ) friends_sub
    ), '[]'::jsonb),

    -- Waiting on me to answer.
    'incoming', COALESCE((
      SELECT jsonb_agg(r ORDER BY r->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'link_id', l.id,
          'user_id', p.id,
          'username', p.username,
          'created_at', l.created_at
        ) AS r
        FROM public.friend_links l
        JOIN public.profiles p ON p.id = l.requested_by
        WHERE l.status = 'pending'
          AND l.requested_by <> v_user_id
          AND v_user_id IN (l.user_a, l.user_b)
      ) incoming_sub
    ), '[]'::jsonb),

    -- Waiting on them.
    'outgoing', COALESCE((
      SELECT jsonb_agg(r ORDER BY r->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'link_id', l.id,
          'user_id', p.id,
          'username', p.username,
          'created_at', l.created_at
        ) AS r
        FROM public.friend_links l
        JOIN public.profiles p
          ON p.id = CASE WHEN l.user_a = v_user_id THEN l.user_b ELSE l.user_a END
        WHERE l.status = 'pending'
          AND l.requested_by = v_user_id
          AND v_user_id IN (l.user_a, l.user_b)
      ) outgoing_sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_friend_code TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_squad TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends TO authenticated;
