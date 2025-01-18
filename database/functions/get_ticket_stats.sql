CREATE OR REPLACE FUNCTION public.get_ticket_stats(agent_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'assigned_to_you', (
      SELECT COUNT(*)
      FROM tickets
      WHERE assigned_to = agent_id
      AND status != 'solved'
    ),
    'unassigned', (
      SELECT COUNT(*)
      FROM tickets
      WHERE assigned_to IS NULL
      AND status != 'solved'
    ),
    'solved', (
      SELECT COUNT(*)
      FROM tickets
      WHERE status = 'solved'
    ),
    'total', (
      SELECT COUNT(*)
      FROM tickets
    )
  ) INTO result;

  RETURN result;
END;
$$; 