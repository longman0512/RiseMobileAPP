-- RISE — development seed data.
--
-- Creates four test accounts with coins, session history, streak stats, squad
-- links in every state, and live activity statuses, so the whole app can be
-- exercised without tapping a physical coin.
--
-- Run AFTER every migration in supabase/migrations/ (001 → 011), in order:
--
--   supabase db reset                       # local: runs migrations then this file
--   psql "$DATABASE_URL" -f supabase/seed.sql   # or paste into the SQL editor
--
-- DO NOT RUN THIS AGAINST PRODUCTION. It inserts users directly into auth.users
-- and deletes any existing rows for those four accounts on each run.
--
-- Logins (all share the password below):
--   ada@rise.test  / risetest123
--   linus@rise.test / risetest123
--   grace@rise.test / risetest123
--   alan@rise.test  / risetest123

-- Must be outside the DO block: crypt() is called in its DECLARE section, which
-- is evaluated before the block body runs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

DO $$
DECLARE
  v_ada    UUID := '11111111-1111-4111-8111-111111111111';
  v_linus  UUID := '22222222-2222-4222-8222-222222222222';
  v_grace  UUID := '33333333-3333-4333-8333-333333333333';
  v_alan   UUID := '44444444-4444-4444-8444-444444444444';
  v_all    UUID[] := ARRAY[v_ada, v_linus, v_grace, v_alan];
  v_id     UUID;
  v_email  TEXT;
  v_name   TEXT;
  v_pass   TEXT := crypt('risetest123', gen_salt('bf'));
  v_names  TEXT[] := ARRAY['ada', 'linus', 'grace', 'alan'];
  v_idx    INT;
BEGIN
  -- ---------------------------------------------------------------------
  -- Clean slate for these four accounts only. Cascades clear every child row.
  -- ---------------------------------------------------------------------
  DELETE FROM auth.users WHERE id = ANY(v_all);

  -- ---------------------------------------------------------------------
  -- Accounts
  -- ---------------------------------------------------------------------
  FOR v_idx IN 1..4 LOOP
    v_id := v_all[v_idx];
    v_name := v_names[v_idx];
    v_email := v_name || '@rise.test';

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, v_pass,
      now(), now() - INTERVAL '60 days', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username', v_name)
    );

    -- Supabase needs a matching identity row or password sign-in fails.
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      now(), now() - INTERVAL '60 days', now()
    );

    -- Fixed friend codes so they can be typed from these notes.
    INSERT INTO public.profiles (id, username, friend_code, created_at)
    VALUES (
      v_id,
      v_name,
      (ARRAY['ADA234', 'LNS678', 'GRC345', 'ALN789'])[v_idx],
      now() - INTERVAL '60 days'
    );
  END LOOP;

  -- ---------------------------------------------------------------------
  -- Coins. Ada has all three; the others have a subset, so the app's
  -- "register this coin first" path is reachable.
  -- ---------------------------------------------------------------------
  INSERT INTO public.coins (coin_id, user_id, coin_type, registered_at, active) VALUES
    ('04A1B2C3D40001', v_ada,   'lockin', now() - INTERVAL '58 days', true),
    ('04A1B2C3D40002', v_ada,   'flow',   now() - INTERVAL '58 days', true),
    ('04A1B2C3D40003', v_ada,   'reset',  now() - INTERVAL '58 days', true),
    ('04A1B2C3D40004', v_linus, 'lockin', now() - INTERVAL '40 days', true),
    ('04A1B2C3D40005', v_linus, 'flow',   now() - INTERVAL '40 days', true),
    ('04A1B2C3D40006', v_grace, 'lockin', now() - INTERVAL '20 days', true),
    -- Retired coin: proves the "replaced / lost" path renders correctly.
    ('04A1B2C3D40007', v_grace, 'flow',   now() - INTERVAL '30 days', false);
  -- Alan has none — use him to test the coin-onboarding flow.

  -- ---------------------------------------------------------------------
  -- Session history. Ada gets an unbroken 14-day run ending today so the
  -- streak, heatmap and "today focused" figures are all non-zero.
  -- ---------------------------------------------------------------------
  FOR v_idx IN 0..13 LOOP
    INSERT INTO public.sessions (user_id, started_at, coin_type, duration_mins, note, next_block, segments)
    VALUES (
      v_ada,
      (now() - (v_idx || ' days')::interval)::date + TIME '09:15',
      'lockin', 50,
      'Deep work block ' || (14 - v_idx),
      'Review notes',
      '[{"protocol":"lockin","duration_mins":50}]'::jsonb
    );

    -- Every other day also has a FLOW ↔ RESET chain, which is the case that
    -- used to be double-counted: 3 legs, 45 focus minutes, 10 recovery.
    IF v_idx % 2 = 0 THEN
      INSERT INTO public.sessions (user_id, started_at, coin_type, duration_mins, note, next_block, segments)
      VALUES (
        v_ada,
        (now() - (v_idx || ' days')::interval)::date + TIME '14:00',
        'flow', 45,
        'Sketching the new flow',
        'Ship the prototype',
        '[{"protocol":"flow","duration_mins":30},{"protocol":"reset","duration_mins":10},{"protocol":"flow","duration_mins":15}]'::jsonb
      );
    END IF;
  END LOOP;

  -- A standalone RESET, saved with its true length (this used to collapse to 1 min).
  INSERT INTO public.sessions (user_id, started_at, coin_type, duration_mins, segments)
  VALUES (
    v_ada, now() - INTERVAL '1 day' + INTERVAL '3 hours', 'reset', 10,
    '[{"protocol":"reset","duration_mins":10}]'::jsonb
  );

  -- Linus: a broken streak (nothing yesterday) to contrast with Ada.
  INSERT INTO public.sessions (user_id, started_at, coin_type, duration_mins, segments) VALUES
    (v_linus, now() - INTERVAL '2 days' + INTERVAL '10 hours', 'lockin', 90,
     '[{"protocol":"lockin","duration_mins":90}]'::jsonb),
    (v_linus, now() - INTERVAL '4 days' + INTERVAL '11 hours', 'flow', 60,
     '[{"protocol":"flow","duration_mins":60}]'::jsonb);

  -- Grace: a single session today.
  INSERT INTO public.sessions (user_id, started_at, coin_type, duration_mins, segments)
  VALUES (v_grace, now() - INTERVAL '2 hours', 'lockin', 25,
     '[{"protocol":"lockin","duration_mins":25}]'::jsonb);

  -- ---------------------------------------------------------------------
  -- Aggregate stats, derived from the rows above so nothing contradicts.
  -- ---------------------------------------------------------------------
  INSERT INTO public.user_stats (
    user_id, current_streak, longest_streak, last_session_date,
    total_lockin_mins, total_flow_mins, total_reset_mins, updated_at
  )
  SELECT
    s.user_id,
    CASE WHEN s.user_id = v_ada THEN 14 WHEN s.user_id = v_grace THEN 1 ELSE 0 END,
    CASE WHEN s.user_id = v_ada THEN 14 WHEN s.user_id = v_linus THEN 5 ELSE 1 END,
    MAX(s.started_at)::date,
    COALESCE(SUM(s.duration_mins) FILTER (WHERE s.coin_type = 'lockin'), 0),
    COALESCE(SUM(s.duration_mins) FILTER (WHERE s.coin_type = 'flow'), 0),
    COALESCE(SUM(s.duration_mins) FILTER (WHERE s.coin_type = 'reset'), 0),
    now()
  FROM public.sessions s
  WHERE s.user_id = ANY(v_all)
  GROUP BY s.user_id;

  -- ---------------------------------------------------------------------
  -- Squad links — one of every state, seen from Ada's account.
  --   Ada ↔ Linus  accepted
  --   Ada ↔ Grace  accepted
  --   Alan → Ada   pending  (shows in Ada's "new requests", with Accept)
  --   Ada → ...    pending  (shows in Ada's "waiting on them")
  -- Grace ↔ Linus are also friends, so Ada is not the only connected account.
  -- ---------------------------------------------------------------------
  INSERT INTO public.friend_links (user_a, user_b, requested_by, status, created_at, responded_at) VALUES
    (LEAST(v_ada, v_linus),  GREATEST(v_ada, v_linus),  v_ada,   'accepted',
     now() - INTERVAL '30 days', now() - INTERVAL '30 days'),
    (LEAST(v_ada, v_grace),  GREATEST(v_ada, v_grace),  v_grace, 'accepted',
     now() - INTERVAL '12 days', now() - INTERVAL '12 days'),
    (LEAST(v_alan, v_ada),   GREATEST(v_alan, v_ada),   v_alan,  'pending',
     now() - INTERVAL '3 hours', NULL),
    (LEAST(v_grace, v_linus), GREATEST(v_grace, v_linus), v_grace, 'accepted',
     now() - INTERVAL '8 days', now() - INTERVAL '8 days');

  -- ---------------------------------------------------------------------
  -- Live activity. Every state is represented so all four status colours
  -- render on the Squad tab at once.
  -- ---------------------------------------------------------------------
  INSERT INTO public.user_status (user_id, state, started_at, shift_started_at, blocks, updated_at) VALUES
    -- Mid Lock In, 20 minutes into a shift that already has two blocks behind it.
    (v_linus, 'lockin', now() - INTERVAL '20 minutes', now() - INTERVAL '2 hours',
     '[{"protocol":"lockin","duration_mins":50},{"protocol":"reset","duration_mins":10}]'::jsonb,
     now() - INTERVAL '20 minutes'),
    -- Mid Flow, first block of a fresh shift.
    (v_grace, 'flow', now() - INTERVAL '8 minutes', now() - INTERVAL '8 minutes',
     '[]'::jsonb, now() - INTERVAL '8 minutes'),
    -- On a pause between blocks.
    (v_alan, 'paused', now() - INTERVAL '4 minutes', now() - INTERVAL '90 minutes',
     '[{"protocol":"flow","duration_mins":75}]'::jsonb, now() - INTERVAL '4 minutes'),
    -- Not working.
    (v_ada, 'offline', NULL, NULL, '[]'::jsonb, now() - INTERVAL '3 hours');
END $$;

COMMIT;

-- Quick check that the seed landed:
--   SELECT username, friend_code FROM public.profiles ORDER BY username;
--   SELECT state, count(*) FROM public.user_status GROUP BY state;
--   SELECT status, count(*) FROM public.friend_links GROUP BY status;
