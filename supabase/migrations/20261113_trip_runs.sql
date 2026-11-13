-- Road Pulse: anonymous historical trip durations only. Apply manually via Supabase SQL Editor.
create table if not exists public.trip_runs (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('outbound', 'return')),
  service_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer generated always as (
    case when ended_at is null then null
      else greatest(0, floor(extract(epoch from (ended_at - started_at)))::integer) end
  ) stored,
  constraint trip_runs_end_after_start check (ended_at is null or ended_at > started_at)
);

create index if not exists trip_runs_duration_lookup
  on public.trip_runs (direction, service_date) where duration_seconds is not null;

alter table public.trip_runs enable row level security;
revoke all on public.trip_runs from public, anon, authenticated;
-- No client access to individual trip rows. All writes and aggregate reads go through narrow RPCs.

create or replace function public.start_trip_run(p_direction text, p_service_date date)
returns table (trip_id uuid, started_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_started timestamptz := pg_catalog.now();
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then raise exception 'admin only' using errcode = '42501'; end if;
  if p_direction not in ('outbound', 'return') or p_service_date is null then
    raise exception 'invalid trip direction or service date' using errcode = '22023';
  end if;
  insert into public.trip_runs(direction, service_date, started_at)
    values (p_direction, p_service_date, v_started) returning id into v_id;
  return query select v_id, v_started;
end;
$$;

create or replace function public.finish_trip_run(p_trip_id uuid)
returns table (ended_at timestamptz, duration_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare v_end timestamptz := pg_catalog.now(); v_duration integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then raise exception 'admin only' using errcode = '42501'; end if;
  update public.trip_runs r set ended_at = v_end
    where r.id = p_trip_id and r.ended_at is null and r.started_at < v_end
    returning r.duration_seconds into v_duration;
  if not found then raise exception 'trip not found or already finished' using errcode = '22023'; end if;
  return query select v_end, v_duration;
end;
$$;

create or replace function public.get_road_pulse()
returns table (
  direction text, weekday integer, sample_count bigint, median_duration_seconds double precision,
  all_week_sample_count bigint, all_week_median_duration_seconds double precision
)
language sql stable security definer set search_path = '' as $$
  with completed as (
    select r.direction, extract(dow from r.service_date)::integer as weekday, r.duration_seconds
    from public.trip_runs r where r.duration_seconds is not null
  ), grouped as (
    select c.direction, c.weekday, count(*)::bigint as n,
      pg_catalog.percentile_cont(0.5) within group (order by c.duration_seconds) as med
    from completed c group by c.direction, c.weekday
  ), weekly as (
    select c.direction, count(*)::bigint as n,
      pg_catalog.percentile_cont(0.5) within group (order by c.duration_seconds) as med
    from completed c group by c.direction
  )
  select g.direction, g.weekday, g.n, g.med, w.n, w.med
  from grouped g join weekly w using (direction)
  where auth.uid() is not null
$$;

revoke all on function public.start_trip_run(text, date) from public, anon;
revoke all on function public.finish_trip_run(uuid) from public, anon;
revoke all on function public.get_road_pulse() from public, anon;
grant execute on function public.start_trip_run(text, date) to authenticated;
grant execute on function public.finish_trip_run(uuid) to authenticated;
grant execute on function public.get_road_pulse() to authenticated;
