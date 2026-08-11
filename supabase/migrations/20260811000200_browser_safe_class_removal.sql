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
  v_detached_objects integer;
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
  into v_detached_objects
  from private.group_media_assets
  where cohort_id = p_cohort_id
    and status <> 'removed';

  -- Supabase protects storage.objects from direct SQL deletion. Detaching the
  -- private paths removes all application access; the Storage API remains the
  -- appropriate boundary for later physical object cleanup.
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
    'removedStorageObjects', 0,
    'detachedStorageObjects', v_detached_objects,
    'immutableEvidencePreserved', true
  );
end;
$$;

comment on function public.purge_archived_cohort(uuid, text, uuid) is
  'Anonymizes an archived class and detaches private media paths; physical object cleanup uses the Storage API.';
