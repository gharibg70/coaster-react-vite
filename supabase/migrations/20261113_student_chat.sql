-- Student chat schema and narrow RPCs. Review and apply manually; this migration is not applied automatically.
create table if not exists public.student_chat_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  display_name text not null,
  body text not null,
  created_at timestamptz not null default pg_catalog.now()
);

-- These internal tables hold identities and reporters separately from public/realtime rows.
create table if not exists public.student_chat_authors (
  message_id uuid primary key references public.student_chat_messages(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default pg_catalog.now()
);
create index if not exists student_chat_authors_rate_limit_idx
  on public.student_chat_authors (author_id, sent_at desc);

create table if not exists public.student_chat_reports (
  message_id uuid not null references public.student_chat_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'other')),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (message_id, reporter_id)
);

alter table public.student_chat_messages enable row level security;
alter table public.student_chat_authors enable row level security;
alter table public.student_chat_reports enable row level security;
revoke all on public.student_chat_messages from public, anon, authenticated;
revoke all on public.student_chat_authors from public, anon, authenticated;
revoke all on public.student_chat_reports from public, anon, authenticated;
grant select on public.student_chat_messages to authenticated;

drop policy if exists student_chat_messages_eligible_read on public.student_chat_messages;
create policy student_chat_messages_eligible_read on public.student_chat_messages
for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  or exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid() and s.status = 'active'
      and (s.end_date is null or s.end_date >= (pg_catalog.now() at time zone 'Asia/Baghdad')::date)
  )
);

-- Expose only a boolean so an open client can revalidate eligibility without fetching account data.
create or replace function public.student_chat_access()
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    and exists (
      select 1 from public.subscriptions s
      where s.user_id = auth.uid() and s.status = 'active'
        and (s.end_date is null or s.end_date >= (pg_catalog.now() at time zone 'Asia/Baghdad')::date)
    );
$$;

create or replace function public.send_student_chat_message(p_body text)
returns table (id uuid, display_name text, body text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_body text;
  v_name text;
  v_id uuid;
  v_created_at timestamptz;
  v_last_sent timestamptz;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'admins cannot post student messages' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.subscriptions s
    where s.user_id = v_user_id and s.status = 'active'
      and (s.end_date is null or s.end_date >= (pg_catalog.now() at time zone 'Asia/Baghdad')::date)
  ) then raise exception 'active subscription required' using errcode = '42501'; end if;

  v_body := pg_catalog.btrim(coalesce(p_body, ''));
  if v_body = '' or pg_catalog.char_length(v_body) > 500 then
    raise exception 'message must contain 1 to 500 Unicode code points' using errcode = '22023';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = v_user_id;
  if v_name is null or pg_catalog.btrim(v_name) = '' then
    raise exception 'profile display name required' using errcode = '22023';
  end if;

  -- Serialize same-account send attempts; the transaction lock covers check and insert.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  v_created_at := pg_catalog.clock_timestamp();
  select a.sent_at into v_last_sent
    from public.student_chat_authors a where a.author_id = v_user_id
    order by a.sent_at desc limit 1;
  if v_last_sent is not null and v_created_at < v_last_sent + interval '2 seconds' then
    raise exception 'rate limit: wait two seconds between messages' using errcode = 'P0001';
  end if;

  insert into public.student_chat_messages(display_name, body, created_at)
    values (v_name, v_body, v_created_at) returning student_chat_messages.id into v_id;
  insert into public.student_chat_authors(message_id, author_id, sent_at)
    values (v_id, v_user_id, v_created_at);
  return query select v_id, v_name, v_body, v_created_at;
end;
$$;

create or replace function public.report_student_chat_message(p_message_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'admins cannot report student messages' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.subscriptions s where s.user_id = v_user_id and s.status = 'active'
      and (s.end_date is null or s.end_date >= (pg_catalog.now() at time zone 'Asia/Baghdad')::date)
  ) then raise exception 'active subscription required' using errcode = '42501'; end if;
  if p_reason not in ('spam', 'abuse', 'other') then raise exception 'invalid report reason' using errcode = '22023'; end if;
  if not exists (select 1 from public.student_chat_messages m where m.id = p_message_id) then
    raise exception 'message not found' using errcode = '22023';
  end if;
  insert into public.student_chat_reports(message_id, reporter_id, reason)
    values (p_message_id, v_user_id, p_reason);
exception when unique_violation then
  raise exception 'message already reported by this user' using errcode = '23505';
end;
$$;

create or replace function public.admin_list_student_chat_reports(p_limit integer default 100)
returns table (message_id uuid, display_name text, body text, created_at timestamptz, report_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then raise exception 'admin only' using errcode = '42501'; end if;
  return query
    select m.id, m.display_name, m.body, m.created_at, pg_catalog.count(r.message_id)::bigint
    from public.student_chat_messages m
    join public.student_chat_reports r on r.message_id = m.id
    group by m.id, m.display_name, m.body, m.created_at
    order by pg_catalog.count(r.message_id) desc, m.created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 100));
end;
$$;

create or replace function public.admin_delete_student_chat_message(p_message_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then raise exception 'admin only' using errcode = '42501'; end if;
  delete from public.student_chat_messages m where m.id = p_message_id;
  if not found then raise exception 'message not found' using errcode = '22023'; end if;
end;
$$;

revoke all on function public.student_chat_access() from public, anon;
revoke all on function public.send_student_chat_message(text) from public, anon;
revoke all on function public.report_student_chat_message(uuid, text) from public, anon;
revoke all on function public.admin_list_student_chat_reports(integer) from public, anon;
revoke all on function public.admin_delete_student_chat_message(uuid) from public, anon;
grant execute on function public.student_chat_access() to authenticated;
grant execute on function public.send_student_chat_message(text) to authenticated;
grant execute on function public.report_student_chat_message(uuid, text) to authenticated;
grant execute on function public.admin_list_student_chat_reports(integer) to authenticated;
grant execute on function public.admin_delete_student_chat_message(uuid) to authenticated;

-- Realtime publishes only the safe message relation (never author/report tables).
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_chat_messages'
     ) then
    alter publication supabase_realtime add table public.student_chat_messages;
  end if;
end;
$$;
