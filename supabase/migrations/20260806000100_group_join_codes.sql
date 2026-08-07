create table public.cohort_group_join_codes (
  id uuid primary key default gen_random_uuid(),
  join_window_id uuid not null
    references public.cohort_join_windows(id)
    on delete cascade,
  cohort_id uuid not null
    references public.cohorts(id)
    on delete cascade,
  group_id uuid not null,
  code_hash text not null unique
    check (code_hash ~ '^[a-f0-9]{64}$'),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cohort_group_join_codes_group_cohort_fk
    foreign key (group_id, cohort_id)
    references public.groups(id, cohort_id)
    on delete cascade,
  unique (join_window_id, group_id)
);

create index cohort_group_join_codes_window_idx
  on public.cohort_group_join_codes (join_window_id);
create index cohort_group_join_codes_group_idx
  on public.cohort_group_join_codes (group_id);

alter table public.cohort_group_join_codes enable row level security;
alter table public.cohort_group_join_codes force row level security;
revoke all on table public.cohort_group_join_codes
  from public, anon, authenticated;

comment on table public.cohort_group_join_codes is
  'Window-scoped group authorization hashes. Raw classroom codes are never stored.';

create or replace function public.configure_cohort_group_join_codes(
  p_cohort_id uuid,
  p_join_window_id uuid,
  p_codes jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_valid integer;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.cohort_join_windows
    where id = p_join_window_id
      and cohort_id = p_cohort_id
      and closed_at is null
      and opens_at <= now()
      and expires_at > now()
  ) then
    raise exception 'JOIN_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  select group_count::integer
  into v_expected
  from public.cohorts
  where id = p_cohort_id
    and archived_at is null;

  if v_expected is null
    or jsonb_typeof(p_codes) <> 'array'
    or jsonb_array_length(p_codes) <> v_expected
  then
    raise exception 'INVALID_GROUP_CODES' using errcode = '22023';
  end if;

  select count(distinct groups.id)::integer
  into v_valid
  from jsonb_array_elements(p_codes) as code(value)
  join public.groups as groups
    on groups.id = (code.value ->> 'groupId')::uuid
    and groups.cohort_id = p_cohort_id
  where code.value ->> 'codeHash' ~ '^[a-f0-9]{64}$';

  if v_valid <> v_expected then
    raise exception 'INVALID_GROUP_CODES' using errcode = '22023';
  end if;

  delete from public.cohort_group_join_codes
  where join_window_id = p_join_window_id;

  insert into public.cohort_group_join_codes (
    join_window_id,
    cohort_id,
    group_id,
    code_hash
  )
  select
    p_join_window_id,
    p_cohort_id,
    (code.value ->> 'groupId')::uuid,
    code.value ->> 'codeHash'
  from jsonb_array_elements(p_codes) as code(value);

  return true;
end;
$$;

create or replace function public.preflight_student_code_join(
  p_code_hash text,
  p_rate_key_hash text
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disabled_at timestamptz;
  v_token_hash text;
  v_group_number smallint;
  v_archived_at timestamptz;
begin
  select
    codes.disabled_at,
    windows.token_hash,
    groups.group_number,
    cohorts.archived_at
  into v_disabled_at, v_token_hash, v_group_number, v_archived_at
  from public.cohort_group_join_codes as codes
  join public.cohort_join_windows as windows
    on windows.id = codes.join_window_id
  join public.groups as groups
    on groups.id = codes.group_id
    and groups.cohort_id = codes.cohort_id
  join public.cohorts as cohorts
    on cohorts.id = codes.cohort_id
  where codes.code_hash = p_code_hash
  for update of codes, windows, groups;

  if not found then
    raise exception 'INVALID_JOIN_CODE' using errcode = 'P0001';
  end if;
  if v_archived_at is not null then
    raise exception 'INACTIVE_COHORT' using errcode = 'P0001';
  end if;
  if v_disabled_at is not null then
    raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
  end if;

  begin
    perform public.preflight_student_join(
      v_token_hash,
      v_group_number,
      p_rate_key_hash
    );
  exception
    when raise_exception then
      if sqlerrm = 'JOIN_WINDOW_CLOSED' then
        raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
      end if;
      raise;
  end;

  return v_group_number;
end;
$$;

create or replace function public.find_completed_student_code_join(
  p_code_hash text,
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
  select completed.*
  from public.cohort_group_join_codes as codes
  join public.cohort_join_windows as windows
    on windows.id = codes.join_window_id
  cross join lateral public.find_completed_student_join(
    windows.token_hash,
    p_request_key
  ) as completed
  where codes.code_hash = p_code_hash
    and completed.group_id = codes.group_id
$$;

create or replace function public.complete_student_code_join(
  p_code_hash text,
  p_request_key uuid,
  p_student_id uuid,
  p_display_name text
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
  v_disabled_at timestamptz;
  v_token_hash text;
  v_group_number smallint;
  v_archived_at timestamptz;
begin
  select
    codes.disabled_at,
    windows.token_hash,
    groups.group_number,
    cohorts.archived_at
  into v_disabled_at, v_token_hash, v_group_number, v_archived_at
  from public.cohort_group_join_codes as codes
  join public.cohort_join_windows as windows
    on windows.id = codes.join_window_id
  join public.groups as groups
    on groups.id = codes.group_id
    and groups.cohort_id = codes.cohort_id
  join public.cohorts as cohorts
    on cohorts.id = codes.cohort_id
  where codes.code_hash = p_code_hash
  for update of codes, windows, groups;

  if not found then
    raise exception 'INVALID_JOIN_CODE' using errcode = 'P0001';
  end if;
  if v_archived_at is not null then
    raise exception 'INACTIVE_COHORT' using errcode = 'P0001';
  end if;
  if v_disabled_at is not null then
    raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
  end if;

  begin
    return query
    select *
    from public.complete_student_join(
      v_token_hash,
      p_request_key,
      p_student_id,
      v_group_number,
      p_display_name,
      null
    );
  exception
    when raise_exception then
      if sqlerrm = 'JOIN_WINDOW_CLOSED' then
        raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
      end if;
      raise;
  end;
end;
$$;

create or replace function public.set_group_join_code_enabled(
  p_cohort_id uuid,
  p_group_id uuid,
  p_enabled boolean,
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
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  update public.cohort_group_join_codes as codes
  set disabled_at = case when p_enabled then null else coalesce(disabled_at, now()) end
  from public.cohort_join_windows as windows
  where codes.join_window_id = windows.id
    and codes.cohort_id = p_cohort_id
    and codes.group_id = p_group_id
    and windows.closed_at is null
    and windows.expires_at > now();
  v_changed := found;

  if not v_changed then
    raise exception 'GROUP_JOIN_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

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
    case when p_enabled then 'group_join.enabled' else 'group_join.disabled' end,
    p_group_id,
    p_request_key
  )
  on conflict (actor_user_id, event_type, request_key) do nothing;

  return true;
end;
$$;

revoke all on function public.configure_cohort_group_join_codes(uuid, uuid, jsonb)
  from public;
revoke all on function public.preflight_student_code_join(text, text)
  from public;
revoke all on function public.find_completed_student_code_join(text, uuid)
  from public;
revoke all on function public.complete_student_code_join(text, uuid, uuid, text)
  from public;
revoke all on function public.set_group_join_code_enabled(uuid, uuid, boolean, uuid)
  from public;

grant execute on function public.configure_cohort_group_join_codes(uuid, uuid, jsonb)
  to authenticated;
grant execute on function public.preflight_student_code_join(text, text)
  to service_role;
grant execute on function public.find_completed_student_code_join(text, uuid)
  to service_role;
grant execute on function public.complete_student_code_join(text, uuid, uuid, text)
  to service_role;
grant execute on function public.set_group_join_code_enabled(uuid, uuid, boolean, uuid)
  to authenticated;
