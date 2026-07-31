alter table public.cohorts
  add column archived_at timestamptz;

create index cohorts_archived_at_idx
  on public.cohorts (archived_at)
  where archived_at is not null;

create table private.data_retention_configuration (
  singleton boolean primary key default true check (singleton),
  cohort_retention_days integer
    check (cohort_retention_days between 1 and 3650),
  approved_by text,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (cohort_retention_days is null and approved_by is null and approved_at is null)
    or
    (cohort_retention_days is not null and approved_by is not null and approved_at is not null)
  )
);

insert into private.data_retention_configuration (
  singleton,
  cohort_retention_days
)
values (true, null);

revoke all on table private.data_retention_configuration
  from public, anon, authenticated;

create or replace function public.archive_teacher_cohort(
  p_cohort_id uuid,
  p_request_key uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception using
      errcode = 'P0001',
      message = 'COHORT_NOT_AVAILABLE';
  end if;

  update public.cohorts
  set archived_at = coalesce(archived_at, now())
  where id = p_cohort_id
  returning archived_at into v_archived_at;

  update public.cohort_join_windows
  set closed_at = coalesce(closed_at, now())
  where cohort_id = p_cohort_id
    and closed_at is null;

  insert into public.cohort_session_controls (
    cohort_id,
    quest_starts_allowed,
    closed_at,
    updated_by
  )
  values (p_cohort_id, false, now(), auth.uid())
  on conflict (cohort_id) do update
  set
    quest_starts_allowed = false,
    closed_at = coalesce(
      public.cohort_session_controls.closed_at,
      now()
    ),
    updated_at = now(),
    updated_by = auth.uid();

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
    'cohort.archived',
    p_cohort_id,
    p_request_key
  )
  on conflict (actor_user_id, event_type, request_key) do nothing;

  return v_archived_at;
end;
$$;

create or replace function public.purge_archived_cohort(
  p_cohort_id uuid,
  p_confirmation text,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_students integer;
  v_objects integer;
begin
  if not public.teacher_owns_cohort(p_cohort_id)
    or not exists (
      select 1
      from public.cohorts
      where id = p_cohort_id
        and archived_at is not null
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'COHORT_NOT_AVAILABLE';
  end if;
  if p_confirmation <> 'PURGE ' || p_cohort_id::text then
    raise exception using
      errcode = '22023',
      message = 'PURGE_CONFIRMATION_REQUIRED';
  end if;

  select count(*)::integer
  into v_students
  from public.student_private_profiles
  where cohort_id = p_cohort_id;

  update public.student_private_profiles
  set real_name = 'Archived learner'
  where cohort_id = p_cohort_id;
  update public.student_public_profiles
  set nickname = 'Archived learner'
  where cohort_id = p_cohort_id;
  update public.quest_reflections
  set reflection_note = null
  where exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = quest_reflections.attempt_id
      and quest_attempts.cohort_id = p_cohort_id
  );

  delete from private.session_recovery_tokens
  where cohort_id = p_cohort_id;

  select count(*)::integer
  into v_objects
  from private.group_media_assets
  where cohort_id = p_cohort_id
    and status <> 'removed';

  delete from storage.objects
  where bucket_id = 'group-images'
    and name in (
      select object_path
      from private.group_media_assets
      where cohort_id = p_cohort_id
    );
  update private.group_media_assets
  set status = 'removed'
  where cohort_id = p_cohort_id;
  update public.groups
  set image_object_path = null
  where cohort_id = p_cohort_id;

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
    'cohort.anonymized',
    p_cohort_id,
    p_request_key
  )
  on conflict (actor_user_id, event_type, request_key) do nothing;

  return jsonb_build_object(
    'anonymizedStudents', v_students,
    'removedStorageObjects', v_objects,
    'immutableEvidencePreserved', true
  );
end;
$$;

create or replace function public.run_expired_artifact_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovery integer;
  v_attempts integer;
  v_windows integer;
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;

  delete from private.session_recovery_tokens
  where expires_at < now() - interval '1 day';
  get diagnostics v_recovery = row_count;

  delete from private.join_attempts
  where attempted_at < now() - interval '1 day';
  get diagnostics v_attempts = row_count;

  update public.cohort_join_windows
  set closed_at = coalesce(closed_at, expires_at)
  where expires_at < now()
    and closed_at is null;
  get diagnostics v_windows = row_count;

  return jsonb_build_object(
    'recoveryTokensRemoved', v_recovery,
    'rateLimitEventsRemoved', v_attempts,
    'joinWindowsClosed', v_windows
  );
end;
$$;

revoke all on function public.archive_teacher_cohort(uuid, uuid)
  from public;
revoke all on function public.purge_archived_cohort(uuid, text, uuid)
  from public;
revoke all on function public.run_expired_artifact_cleanup()
  from public;

grant execute on function public.archive_teacher_cohort(uuid, uuid)
  to authenticated;
grant execute on function public.purge_archived_cohort(uuid, text, uuid)
  to authenticated;
grant execute on function public.run_expired_artifact_cleanup()
  to service_role;

comment on table private.data_retention_configuration is
  'Production retention is intentionally NULL until the course owner records an approved period.';
comment on function public.purge_archived_cohort(uuid, text, uuid) is
  'Anonymizes identity and reflection text while preserving aggregate learning evidence.';
