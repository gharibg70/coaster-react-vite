-- Follow-up to 20261113_student_chat.sql. Apply after the base chat migration.
-- Safe message rows contain no account identifiers; internal author/report tables stay private.
alter table public.student_chat_messages add column if not exists room_group text;
alter table public.student_chat_messages add column if not exists is_admin boolean not null default false;

-- Assign old messages only when their private author has a valid current group.
update public.student_chat_messages m
set room_group = p.group_type
from public.student_chat_authors a
join public.profiles p on p.id = a.author_id
where a.message_id = m.id and m.room_group is null
  and p.group_type in ('boys', 'girls');

alter table public.student_chat_messages drop constraint if exists student_chat_messages_room_group_check;
alter table public.student_chat_messages add constraint student_chat_messages_room_group_check
  check (room_group is null or room_group in ('boys', 'girls'));

-- Recreate read policy: admins can see classified messages in either room; students only their eligible room.
drop policy if exists student_chat_messages_eligible_read on public.student_chat_messages;
drop policy if exists student_chat_messages_room_read on public.student_chat_messages;
create policy student_chat_messages_room_read on public.student_chat_messages
for select to authenticated using (
  room_group in ('boys', 'girls') and (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists (
      select 1 from public.profiles p join public.subscriptions s on s.user_id = p.id
      where p.id = auth.uid() and p.role <> 'admin' and p.group_type = room_group
        and p.group_type in ('boys', 'girls') and s.status = 'active'
        and (s.end_date is null or s.end_date >= (pg_catalog.now() at time zone 'Asia/Baghdad')::date)
    )
  )
);

create or replace function public.chat_room_access(p_room text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_room is null or p_room not in ('boys', 'girls') then return false; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin') then return true; end if;
  return exists (
    select 1 from public.profiles p join public.subscriptions s on s.user_id = p.id
    where p.id = v_uid and p.group_type = p_room and p.group_type in ('boys', 'girls')
      and s.status = 'active'
      and (s.end_date is null or s.end_date >= (pg_catalog.now() at time zone 'Asia/Baghdad')::date)
  );
end;
$$;

create or replace function public.send_chat_room_message(p_room text, p_body text)
returns table (id uuid, room_group text, display_name text, is_admin boolean, body text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_admin boolean; v_name text; v_body text;
  v_id uuid; v_created timestamptz; v_last timestamptz;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_room is null or p_room not in ('boys', 'girls') then raise exception 'invalid room' using errcode = '22023'; end if;
  select p.role = 'admin', p.full_name into v_admin, v_name from public.profiles p where p.id = v_uid;
  if coalesce(v_admin, false) then
    null;
  elsif not public.chat_room_access(p_room) then
    raise exception 'room access denied' using errcode = '42501';
  end if;
  if v_name is null or pg_catalog.btrim(v_name) = '' then raise exception 'profile display name required' using errcode = '22023'; end if;
  v_body := pg_catalog.btrim(coalesce(p_body, ''));
  if v_body = '' or pg_catalog.char_length(v_body) > 500 then raise exception 'message must contain 1 to 500 Unicode code points' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));
  v_created := pg_catalog.clock_timestamp();
  select a.sent_at into v_last from public.student_chat_authors a
    where a.author_id = v_uid order by a.sent_at desc limit 1;
  if v_last is not null and v_created < v_last + interval '2 seconds' then
    raise exception 'rate limit: wait two seconds between messages' using errcode = 'P0001';
  end if;
  insert into public.student_chat_messages(display_name, body, created_at, room_group, is_admin)
    values (v_name, v_body, v_created, p_room, coalesce(v_admin, false)) returning student_chat_messages.id into v_id;
  insert into public.student_chat_authors(message_id, author_id, sent_at) values (v_id, v_uid, v_created);
  return query select v_id, p_room, v_name, coalesce(v_admin, false), v_body, v_created;
end;
$$;

-- The legacy report entry point cannot select a room; replace it with a rejecting stub.
create or replace function public.report_student_chat_message(p_message_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'room-aware reporting required' using errcode = '42501';
end;
$$;

create or replace function public.report_student_chat_room_message(p_room text, p_message_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_room is null or p_room not in ('boys', 'girls') then raise exception 'invalid room' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin') then raise exception 'admins cannot report student messages' using errcode = '42501'; end if;
  if not public.chat_room_access(p_room) then raise exception 'room access denied' using errcode = '42501'; end if;
  if p_reason not in ('spam', 'abuse', 'other') then raise exception 'invalid report reason' using errcode = '22023'; end if;
  if not exists (select 1 from public.student_chat_messages m where m.id = p_message_id and m.room_group = p_room) then raise exception 'message not found in selected room' using errcode = '22023'; end if;
  insert into public.student_chat_reports(message_id, reporter_id, reason) values (p_message_id, v_uid, p_reason);
exception when unique_violation then raise exception 'message already reported by this user' using errcode = '23505';
end;
$$;

create or replace function public.admin_list_student_chat_reports(p_room text, p_limit integer default 100)
returns table (message_id uuid, room_group text, display_name text, body text, created_at timestamptz, report_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then raise exception 'admin only' using errcode = '42501'; end if;
  if p_room is null or p_room not in ('boys', 'girls') then raise exception 'valid selected room required' using errcode = '22023'; end if;
  return query select m.id, m.room_group, m.display_name, m.body, m.created_at, pg_catalog.count(r.message_id)::bigint
    from public.student_chat_messages m join public.student_chat_reports r on r.message_id = m.id
    where m.room_group = p_room group by m.id, m.room_group, m.display_name, m.body, m.created_at
    order by pg_catalog.count(r.message_id) desc, m.created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 100));
end;
$$;

create or replace function public.admin_delete_student_chat_message(p_message_id uuid, p_room text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then raise exception 'admin only' using errcode = '42501'; end if;
  if p_room is null or p_room not in ('boys', 'girls') then raise exception 'valid selected room required' using errcode = '22023'; end if;
  delete from public.student_chat_messages m where m.id = p_message_id and m.room_group = p_room;
  if not found then raise exception 'message not found in selected room' using errcode = '22023'; end if;
end;
$$;

-- Retire the unscoped send/report/moderation routes installed by the base migration.
revoke all on function public.send_student_chat_message(text) from public, anon, authenticated;
revoke all on function public.student_chat_access() from public, anon, authenticated;
revoke all on function public.admin_list_student_chat_reports(integer) from public, anon, authenticated;
revoke all on function public.admin_delete_student_chat_message(uuid) from public, anon, authenticated;
revoke all on function public.report_student_chat_message(uuid, text) from public, anon, authenticated;
revoke all on function public.chat_room_access(text) from public, anon;
revoke all on function public.send_chat_room_message(text, text) from public, anon;
revoke all on function public.report_student_chat_room_message(text, uuid, text) from public, anon;
revoke all on function public.admin_list_student_chat_reports(text, integer) from public, anon;
revoke all on function public.admin_delete_student_chat_message(uuid, text) from public, anon;
grant execute on function public.chat_room_access(text) to authenticated;
grant execute on function public.send_chat_room_message(text, text) to authenticated;
grant execute on function public.report_student_chat_room_message(text, uuid, text) to authenticated;
grant execute on function public.admin_list_student_chat_reports(text, integer) to authenticated;
grant execute on function public.admin_delete_student_chat_message(uuid, text) to authenticated;

-- Realtime remains limited to the safe public table and tolerates absent/already-added publication.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_chat_messages') then
    alter publication supabase_realtime add table public.student_chat_messages;
  end if;
end;
$$;
