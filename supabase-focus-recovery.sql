-- Recover only the current caller's active Focus session.
-- Apply after the Focus-session RPC and table setup have been installed.

create or replace function public.get_active_focus_session()
returns table (
  session_id uuid,
  started_at timestamptz,
  accumulated_seconds integer,
  active_started_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, pg_temp
as $function$
  select
    focus_session.id,
    focus_session.started_at,
    focus_session.accumulated_seconds,
    focus_session.active_started_at
  from public.focus_sessions as focus_session
  where focus_session.user_id = (select auth.uid())
    and focus_session.completed_at is null
  order by focus_session.created_at desc
  limit 1;
$function$;

revoke all on function public.get_active_focus_session() from public, anon;
grant execute on function public.get_active_focus_session() to authenticated, service_role;
