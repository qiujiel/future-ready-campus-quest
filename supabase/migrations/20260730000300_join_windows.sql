alter table public.cohorts
add column creation_request_key uuid unique;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 2 and 80),
  entity_id uuid,
  request_key uuid,
  result text not null default 'accepted'
    check (result in ('accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (actor_user_id, event_type, request_key)
);

create index audit_events_actor_user_id_idx
  on public.audit_events (actor_user_id);
create index audit_events_cohort_id_idx
  on public.audit_events (cohort_id);
create index audit_events_created_at_idx
  on public.audit_events (created_at desc);

create table public.cohort_join_windows (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  request_key uuid not null unique,
  opens_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > opens_at),
  check (expires_at <= opens_at + interval '15 minutes'),
  check (closed_at is null or closed_at >= opens_at)
);

create unique index cohort_join_windows_one_open_per_cohort_idx
  on public.cohort_join_windows (cohort_id)
  where closed_at is null;
create index cohort_join_windows_cohort_id_idx
  on public.cohort_join_windows (cohort_id);
create index cohort_join_windows_expires_at_idx
  on public.cohort_join_windows (expires_at);

create table public.student_join_requests (
  join_window_id uuid not null
    references public.cohort_join_windows(id)
    on delete cascade,
  request_key uuid not null,
  student_id uuid not null references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (join_window_id, request_key),
  unique (student_id)
);

create index student_join_requests_cohort_id_idx
  on public.student_join_requests (cohort_id);
create index student_join_requests_group_id_idx
  on public.student_join_requests (group_id);

create table private.join_attempts (
  id bigint generated always as identity primary key,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  rate_key_hash text not null check (rate_key_hash ~ '^[a-f0-9]{64}$'),
  attempted_at timestamptz not null default now()
);

create index join_attempts_token_time_idx
  on private.join_attempts (token_hash, attempted_at desc);
create index join_attempts_rate_time_idx
  on private.join_attempts (rate_key_hash, attempted_at desc);

alter table public.audit_events enable row level security;
alter table public.cohort_join_windows enable row level security;
alter table public.student_join_requests enable row level security;
alter table public.audit_events force row level security;
alter table public.cohort_join_windows force row level security;
alter table public.student_join_requests force row level security;

revoke all on table public.audit_events from anon, authenticated;
revoke all on table public.cohort_join_windows from anon, authenticated;
revoke all on table public.student_join_requests from anon, authenticated;

grant select on table public.audit_events to authenticated;

create policy audit_events_teacher_read
on public.audit_events
for select
to authenticated
using (public.teacher_owns_cohort(cohort_id));

create or replace function public.preflight_student_join(
  p_token_hash text,
  p_group_number smallint,
  p_rate_key_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.cohort_join_windows;
  v_group public.groups;
  v_capacity smallint;
begin
  select *
  into v_window
  from public.cohort_join_windows
  where token_hash = p_token_hash
  for update;

  if not found
    or v_window.closed_at is not null
    or v_window.opens_at > now()
    or v_window.expires_at <= now()
  then
    raise exception 'JOIN_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  delete from private.join_attempts
  where attempted_at < now() - interval '10 minutes';

  if (
    select count(*) >= 90
    from private.join_attempts
    where token_hash = p_token_hash
      and attempted_at >= now() - interval '1 minute'
  ) or (
    select count(*) >= 12
    from private.join_attempts
    where rate_key_hash = p_rate_key_hash
      and attempted_at >= now() - interval '1 minute'
  ) then
    raise exception 'JOIN_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  insert into private.join_attempts (token_hash, rate_key_hash)
  values (p_token_hash, p_rate_key_hash);

  select *
  into v_group
  from public.groups
  where cohort_id = v_window.cohort_id
    and group_number = p_group_number;

  if not found then
    raise exception 'INVALID_GROUP' using errcode = 'P0001';
  end if;

  select cohorts.group_capacity
  into v_capacity
  from public.cohorts as cohorts
  where cohorts.id = v_group.cohort_id;

  if (
    select count(*) >= v_capacity
    from public.student_private_profiles as private_profiles
    where private_profiles.group_id = v_group.id
  ) then
    raise exception 'GROUP_FULL' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.create_teacher_cohort(
  p_title text,
  p_group_count smallint,
  p_group_capacity smallint,
  p_request_key uuid
)
returns public.cohorts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cohort public.cohorts;
begin
  if public.current_role() is distinct from 'teacher' then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select *
  into v_cohort
  from public.cohorts
  where teacher_id = auth.uid()
    and creation_request_key = p_request_key;

  if found then
    return v_cohort;
  end if;

  insert into public.cohorts (
    teacher_id,
    title,
    group_count,
    group_capacity,
    creation_request_key
  )
  values (
    auth.uid(),
    btrim(p_title),
    p_group_count,
    p_group_capacity,
    p_request_key
  )
  returning * into v_cohort;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    auth.uid(),
    v_cohort.id,
    'cohort.created',
    v_cohort.id,
    p_request_key
  );

  return v_cohort;
end;
$$;

create or replace function public.open_cohort_join_window(
  p_cohort_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_request_key uuid
)
returns public.cohort_join_windows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.cohort_join_windows;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = '42501';
  end if;

  select *
  into v_window
  from public.cohort_join_windows
  where cohort_id = p_cohort_id
    and request_key = p_request_key;

  if found then
    return v_window;
  end if;

  if p_expires_at <= now()
    or p_expires_at > now() + interval '15 minutes'
  then
    raise exception 'INVALID_JOIN_WINDOW' using errcode = '22023';
  end if;

  update public.cohort_join_windows
  set closed_at = now()
  where cohort_id = p_cohort_id
    and closed_at is null;

  insert into public.cohort_join_windows (
    cohort_id,
    token_hash,
    request_key,
    expires_at,
    created_by
  )
  values (
    p_cohort_id,
    p_token_hash,
    p_request_key,
    p_expires_at,
    auth.uid()
  )
  returning * into v_window;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    auth.uid(),
    p_cohort_id,
    'join_window.opened',
    v_window.id,
    p_request_key
  );

  return v_window;
end;
$$;

create or replace function public.close_cohort_join_window(
  p_cohort_id uuid,
  p_request_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = '42501';
  end if;

  update public.cohort_join_windows
  set closed_at = coalesce(closed_at, now())
  where cohort_id = p_cohort_id
    and closed_at is null;

  v_changed := found;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    request_key
  )
  values (
    auth.uid(),
    p_cohort_id,
    'join_window.closed',
    p_request_key
  )
  on conflict (actor_user_id, event_type, request_key) do nothing;

  return v_changed;
end;
$$;

create or replace function public.find_completed_student_join(
  p_token_hash text,
  p_request_key uuid
)
returns table (
  student_id uuid,
  cohort_id uuid,
  group_id uuid,
  group_number smallint,
  nickname text,
  is_group_identity_editor boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requests.student_id,
    requests.cohort_id,
    requests.group_id,
    groups.group_number,
    profiles.nickname,
    groups.identity_editor_id = requests.student_id
  from public.student_join_requests as requests
  join public.cohort_join_windows as windows
    on windows.id = requests.join_window_id
  join public.groups as groups
    on groups.id = requests.group_id
  join public.student_public_profiles as profiles
    on profiles.student_id = requests.student_id
  where windows.token_hash = p_token_hash
    and requests.request_key = p_request_key
$$;

create or replace function public.complete_student_join(
  p_token_hash text,
  p_request_key uuid,
  p_student_id uuid,
  p_group_number smallint,
  p_real_name text,
  p_nickname text default null
)
returns table (
  student_id uuid,
  cohort_id uuid,
  group_id uuid,
  group_number smallint,
  nickname text,
  is_group_identity_editor boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.cohort_join_windows;
  v_group public.groups;
  v_capacity smallint;
  v_member_count integer;
  v_nickname text;
begin
  select *
  into v_window
  from public.cohort_join_windows
  where token_hash = p_token_hash
  for update;

  if not found
    or v_window.closed_at is not null
    or v_window.opens_at > now()
    or v_window.expires_at <= now()
  then
    raise exception 'JOIN_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.student_join_requests as requests
    where requests.join_window_id = v_window.id
      and requests.request_key = p_request_key
  ) then
    return query
    select * from public.find_completed_student_join(p_token_hash, p_request_key);
    return;
  end if;

  select groups.*
  into v_group
  from public.groups as groups
  where groups.cohort_id = v_window.cohort_id
    and groups.group_number = p_group_number
  for update;

  if not found then
    raise exception 'INVALID_GROUP' using errcode = 'P0001';
  end if;

  select group_capacity
  into v_capacity
  from public.cohorts
  where id = v_group.cohort_id;

  select count(*)
  into v_member_count
  from public.student_private_profiles as private_profiles
  where private_profiles.group_id = v_group.id;

  if v_member_count >= v_capacity then
    raise exception 'GROUP_FULL' using errcode = 'P0001';
  end if;

  v_nickname := nullif(regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g'), '');
  if v_nickname is null then
    v_nickname := 'Explorer ' || (v_member_count + 1)::text;
  end if;

  insert into public.user_roles (user_id, role)
  values (p_student_id, 'student');

  insert into public.student_private_profiles (
    student_id,
    cohort_id,
    group_id,
    real_name
  )
  values (
    p_student_id,
    v_window.cohort_id,
    v_group.id,
    regexp_replace(btrim(p_real_name), '\s+', ' ', 'g')
  );

  insert into public.student_public_profiles (
    student_id,
    cohort_id,
    group_id,
    nickname
  )
  values (
    p_student_id,
    v_window.cohort_id,
    v_group.id,
    v_nickname
  );

  update public.groups
  set identity_editor_id = p_student_id
  where id = v_group.id
    and identity_editor_id is null;

  insert into public.student_join_requests (
    join_window_id,
    request_key,
    student_id,
    cohort_id,
    group_id
  )
  values (
    v_window.id,
    p_request_key,
    p_student_id,
    v_window.cohort_id,
    v_group.id
  );

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    p_student_id,
    v_window.cohort_id,
    'student.joined',
    p_student_id,
    p_request_key
  );

  return query
  select * from public.find_completed_student_join(p_token_hash, p_request_key);
end;
$$;

revoke all on function public.create_teacher_cohort(text, smallint, smallint, uuid)
  from public;
revoke all on function public.open_cohort_join_window(uuid, text, timestamptz, uuid)
  from public;
revoke all on function public.close_cohort_join_window(uuid, uuid)
  from public;
revoke all on function public.find_completed_student_join(text, uuid)
  from public;
revoke all on function public.preflight_student_join(text, smallint, text)
  from public;
revoke all on function public.complete_student_join(
  text,
  uuid,
  uuid,
  smallint,
  text,
  text
) from public;

grant execute on function public.create_teacher_cohort(text, smallint, smallint, uuid)
  to authenticated;
grant execute on function public.open_cohort_join_window(uuid, text, timestamptz, uuid)
  to authenticated;
grant execute on function public.close_cohort_join_window(uuid, uuid)
  to authenticated;
grant execute on function public.find_completed_student_join(text, uuid)
  to service_role;
grant execute on function public.preflight_student_join(text, smallint, text)
  to service_role;
grant execute on function public.complete_student_join(
  text,
  uuid,
  uuid,
  smallint,
  text,
  text
) to service_role;
