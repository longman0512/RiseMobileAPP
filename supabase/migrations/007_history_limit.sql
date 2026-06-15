-- Raise session history RPC cap for 90-day activity calendar.

CREATE OR REPLACE FUNCTION public.get_my_session_history(p_limit INT DEFAULT 50)
RETURNS SETOF public.sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.sessions
  WHERE user_id = auth.uid()
  ORDER BY started_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.get_my_session_history TO authenticated;
