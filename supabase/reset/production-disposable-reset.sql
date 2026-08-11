do $reset$
declare
  actual jsonb;
  canonical_cohort_id uuid;
  marked_teacher_id uuid;
  phase text := 'lock';
begin
  perform pg_advisory_xact_lock(
    hashtextextended('approved-disposable-reset-2026-08-11', 0)
  );

  lock table auth.users, auth.sessions, public.user_roles, public.cohorts,
    public.groups, public.cohort_join_windows, public.cohort_session_controls,
    public.cohort_group_join_codes, public.audit_events,
    public.student_private_profiles, public.student_public_profiles,
    public.quest_attempts, public.phase_progress, public.student_responses,
    public.concept_evidence, public.attempt_items, public.quest_reflections,
    public.quest_results, public.team_score_snapshots,
    public.student_join_requests, private.join_attempts,
    private.session_recovery_tokens, private.group_identity_receipts,
    private.group_media_assets, public.cohort_quest_launches,
    private.cohort_quest_launch_receipts, private.teacher_control_audit,
    private.teacher_roster_control_receipts, storage.objects
    in share row exclusive mode;

  phase := 'schema';
  if to_regclass('private.student_login_credentials') is not null
    or to_regclass('private.student_login_attempts') is not null
  then
    raise exception using
      errcode = 'P0001', message = 'reset precondition rejected';
  end if;

  phase := 'teacher';
  select users.id
  into marked_teacher_id
  from auth.users as users
  join public.user_roles as roles
    on roles.user_id = users.id and roles.role = 'teacher'
  where users.raw_app_meta_data ->> 'bootstrapAuthorizationId'
      = 'course-owner-2026-08-08'
    and users.raw_app_meta_data ->> 'role' = 'teacher';

  if marked_teacher_id is null or (
    select count(*) from auth.users as users
    join public.user_roles as roles
      on roles.user_id = users.id and roles.role = 'teacher'
    where users.raw_app_meta_data ->> 'bootstrapAuthorizationId'
        = 'course-owner-2026-08-08'
      and users.raw_app_meta_data ->> 'role' = 'teacher'
  ) <> 1 then
    raise exception using
      errcode = 'P0001', message = 'reset precondition rejected';
  end if;

  phase := 'cohort';
  select cohorts.id
  into canonical_cohort_id
  from public.cohorts as cohorts
  where cohorts.teacher_id = marked_teacher_id
    and cohorts.title = 'Production Classroom'
    and cohorts.group_count = 5
    and cohorts.group_capacity = 6
    and cohorts.archived_at is null;

  if canonical_cohort_id is null or (
    select count(*) from public.cohorts as cohorts
    where cohorts.teacher_id = marked_teacher_id
      and cohorts.title = 'Production Classroom'
      and cohorts.group_count = 5
      and cohorts.group_capacity = 6
      and cohorts.archived_at is null
  ) <> 1 then
    raise exception using
      errcode = 'P0001', message = 'reset precondition rejected';
  end if;

  phase := 'groups';
  if (
    select array_agg(groups.group_number order by groups.group_number)
    from public.groups as groups
    where groups.cohort_id = canonical_cohort_id
      and groups.group_number between 1 and 5
  ) <> array[1, 2, 3, 4, 5]::smallint[]
  or exists (
    select 1
    from public.groups as groups
    where groups.cohort_id = canonical_cohort_id
      and (
        groups.display_name <> 'Group ' || groups.group_number::text
        or groups.identity_editor_id is not null
        or groups.identity_locked_at is not null
        or groups.image_object_path is not null
      )
      and not exists (
        select 1
        from private.group_identity_receipts as receipts
        where receipts.group_id = groups.id
      )
  )
  or exists (
    select 1
    from private.group_identity_receipts as receipts
    where not exists (
      select 1 from public.groups as groups
      where groups.id = receipts.group_id
        and groups.cohort_id <> canonical_cohort_id
    )
  ) then
    raise exception using
      errcode = 'P0001', message = 'reset precondition rejected';
  end if;

  phase := 'aggregate';
  with marked_teachers as (
    select marked_teacher_id as id
  ), production_classrooms as (
    select canonical_cohort_id as id
  )
  select jsonb_build_object(
    'marked_teacher_count', 1,
    'other_auth_user_count',
      (select count(*)::int from auth.users) - 1,
    'production_classroom_count', 1,
    'other_cohort_count',
      (select count(*)::int from public.cohorts) - 1,
    'production_classroom_group_count',
      (select count(*)::int from public.groups
       where cohort_id = canonical_cohort_id),
    'join_window_count',
      (select count(*)::int from public.cohort_join_windows),
    'session_control_count',
      (select count(*)::int from public.cohort_session_controls),
    'open_joining_count',
      (select count(*)::int from public.cohort_join_windows
       where closed_at is null),
    'open_quest_start_count',
      (select count(*)::int from public.cohort_session_controls
       where quest_starts_allowed = true and closed_at is null),
    'cohort_group_join_code_count',
      (select count(*)::int from public.cohort_group_join_codes),
    'audit_event_count',
      (select count(*)::int from public.audit_events),
    'student_private_profile_count',
      (select count(*)::int from public.student_private_profiles),
    'student_public_profile_count',
      (select count(*)::int from public.student_public_profiles),
    'quest_attempt_count',
      (select count(*)::int from public.quest_attempts),
    'phase_progress_count',
      (select count(*)::int from public.phase_progress),
    'student_response_count',
      (select count(*)::int from public.student_responses),
    'concept_evidence_count',
      (select count(*)::int from public.concept_evidence),
    'attempt_item_count',
      (select count(*)::int from public.attempt_items),
    'quest_reflection_count',
      (select count(*)::int from public.quest_reflections),
    'quest_result_count',
      (select count(*)::int from public.quest_results),
    'team_score_snapshot_count',
      (select count(*)::int from public.team_score_snapshots),
    'student_join_request_count',
      (select count(*)::int from public.student_join_requests),
    'non_teacher_session_count',
      (select count(*)::int from auth.sessions
       where user_id <> marked_teacher_id),
    'join_attempt_count',
      (select count(*)::int from private.join_attempts),
    'recovery_attempt_count',
      (select count(*)::int from private.session_recovery_tokens),
    'group_identity_receipt_count',
      (select count(*)::int from private.group_identity_receipts),
    'group_media_asset_count',
      (select count(*)::int from private.group_media_assets),
    'cohort_quest_launch_count',
      (select count(*)::int from public.cohort_quest_launches),
    'cohort_quest_launch_receipt_count',
      (select count(*)::int from private.cohort_quest_launch_receipts),
    'teacher_control_audit_count',
      (select count(*)::int from private.teacher_control_audit),
    'teacher_roster_control_receipt_count',
      (select count(*)::int from private.teacher_roster_control_receipts),
    'group_image_object_count',
      (select count(*)::int from storage.objects
       where bucket_id = 'group-images'),
    'student_login_credentials_absent', true,
    'student_login_attempts_absent', true
  ) into actual;

  if actual <> '{
    "marked_teacher_count": 1,
    "other_auth_user_count": 1,
    "production_classroom_count": 1,
    "other_cohort_count": 1,
    "production_classroom_group_count": 5,
    "join_window_count": 4,
    "session_control_count": 0,
    "open_joining_count": 0,
    "open_quest_start_count": 0,
    "cohort_group_join_code_count": 24,
    "audit_event_count": 7,
    "student_private_profile_count": 1,
    "student_public_profile_count": 1,
    "quest_attempt_count": 0,
    "phase_progress_count": 0,
    "student_response_count": 0,
    "concept_evidence_count": 0,
    "attempt_item_count": 0,
    "quest_reflection_count": 0,
    "quest_result_count": 0,
    "team_score_snapshot_count": 0,
    "student_join_request_count": 1,
    "non_teacher_session_count": 1,
    "join_attempt_count": 1,
    "recovery_attempt_count": 0,
    "group_identity_receipt_count": 1,
    "group_media_asset_count": 0,
    "cohort_quest_launch_count": 0,
    "cohort_quest_launch_receipt_count": 0,
    "teacher_control_audit_count": 0,
    "teacher_roster_control_receipt_count": 0,
    "group_image_object_count": 0,
    "student_login_credentials_absent": true,
    "student_login_attempts_absent": true
  }'::jsonb then
    raise exception using
      errcode = 'P0001', message = 'reset precondition rejected';
  end if;

  phase := 'normalize_groups';
  update public.groups
  set display_name = 'Group ' || group_number::text,
      identity_editor_id = null,
      identity_locked_at = null,
      image_object_path = null
  where cohort_id = canonical_cohort_id;

  phase := 'delete_join_codes';
  delete from public.cohort_group_join_codes;
  phase := 'delete_join_windows';
  delete from public.cohort_join_windows;
  phase := 'delete_audit';
  delete from public.audit_events;
  phase := 'delete_attempts';
  delete from private.join_attempts;
  phase := 'delete_receipts';
  delete from private.group_identity_receipts;
  phase := 'delete_cohorts';
  delete from public.cohorts where id <> canonical_cohort_id;
  phase := 'delete_users';
  delete from auth.users where id <> marked_teacher_id;

  phase := 'verify';
  with marked_teachers as (
    select users.id
    from auth.users as users
    join public.user_roles as roles
      on roles.user_id = users.id and roles.role = 'teacher'
    where users.raw_app_meta_data ->> 'bootstrapAuthorizationId'
        = 'course-owner-2026-08-08'
      and users.raw_app_meta_data ->> 'role' = 'teacher'
  ), production_classrooms as (
    select cohorts.id
    from public.cohorts as cohorts
    join marked_teachers on marked_teachers.id = cohorts.teacher_id
    where cohorts.title = 'Production Classroom'
      and cohorts.group_count = 5
      and cohorts.group_capacity = 6
      and cohorts.archived_at is null
  )
  select jsonb_build_object(
    'marked_teacher_count', (select count(*)::int from marked_teachers),
    'other_auth_user_count',
      (select count(*)::int from auth.users)
        - (select count(*)::int from marked_teachers),
    'production_classroom_count',
      (select count(*)::int from production_classrooms),
    'other_cohort_count',
      (select count(*)::int from public.cohorts)
        - (select count(*)::int from production_classrooms),
    'production_classroom_group_count',
      (select count(*)::int from public.groups
       where cohort_id in (select id from production_classrooms)),
    'join_window_count',
      (select count(*)::int from public.cohort_join_windows),
    'session_control_count',
      (select count(*)::int from public.cohort_session_controls),
    'open_joining_count',
      (select count(*)::int from public.cohort_join_windows
       where closed_at is null),
    'open_quest_start_count',
      (select count(*)::int from public.cohort_session_controls
       where quest_starts_allowed = true and closed_at is null),
    'cohort_group_join_code_count',
      (select count(*)::int from public.cohort_group_join_codes),
    'audit_event_count',
      (select count(*)::int from public.audit_events),
    'student_private_profile_count',
      (select count(*)::int from public.student_private_profiles),
    'student_public_profile_count',
      (select count(*)::int from public.student_public_profiles),
    'quest_attempt_count',
      (select count(*)::int from public.quest_attempts),
    'phase_progress_count',
      (select count(*)::int from public.phase_progress),
    'student_response_count',
      (select count(*)::int from public.student_responses),
    'concept_evidence_count',
      (select count(*)::int from public.concept_evidence),
    'attempt_item_count',
      (select count(*)::int from public.attempt_items),
    'quest_reflection_count',
      (select count(*)::int from public.quest_reflections),
    'quest_result_count',
      (select count(*)::int from public.quest_results),
    'team_score_snapshot_count',
      (select count(*)::int from public.team_score_snapshots),
    'student_join_request_count',
      (select count(*)::int from public.student_join_requests),
    'non_teacher_session_count',
      (select count(*)::int from auth.sessions
       where user_id not in (select id from marked_teachers)),
    'join_attempt_count',
      (select count(*)::int from private.join_attempts),
    'recovery_attempt_count',
      (select count(*)::int from private.session_recovery_tokens),
    'group_identity_receipt_count',
      (select count(*)::int from private.group_identity_receipts),
    'group_media_asset_count',
      (select count(*)::int from private.group_media_assets),
    'cohort_quest_launch_count',
      (select count(*)::int from public.cohort_quest_launches),
    'cohort_quest_launch_receipt_count',
      (select count(*)::int from private.cohort_quest_launch_receipts),
    'teacher_control_audit_count',
      (select count(*)::int from private.teacher_control_audit),
    'teacher_roster_control_receipt_count',
      (select count(*)::int from private.teacher_roster_control_receipts),
    'group_image_object_count',
      (select count(*)::int from storage.objects
       where bucket_id = 'group-images'),
    'student_login_credentials_absent',
      to_regclass('private.student_login_credentials') is null,
    'student_login_attempts_absent',
      to_regclass('private.student_login_attempts') is null,
    'canonical_group_count', (
      select count(*)::int from public.groups as groups
      where groups.cohort_id in (select id from production_classrooms)
        and groups.group_number between 1 and 5
        and groups.display_name = 'Group ' || groups.group_number::text
        and groups.identity_editor_id is null
        and groups.identity_locked_at is null
        and groups.image_object_path is null
    ),
    'canonical_groups_ready', 5 = (
      select count(*)::int from public.groups as groups
      where groups.cohort_id in (select id from production_classrooms)
        and groups.group_number between 1 and 5
        and groups.display_name = 'Group ' || groups.group_number::text
        and groups.identity_editor_id is null
        and groups.identity_locked_at is null
        and groups.image_object_path is null
    )
  ) into actual;

  if actual <> '{
    "marked_teacher_count": 1,
    "other_auth_user_count": 0,
    "production_classroom_count": 1,
    "other_cohort_count": 0,
    "production_classroom_group_count": 5,
    "join_window_count": 0,
    "session_control_count": 0,
    "open_joining_count": 0,
    "open_quest_start_count": 0,
    "cohort_group_join_code_count": 0,
    "audit_event_count": 0,
    "student_private_profile_count": 0,
    "student_public_profile_count": 0,
    "quest_attempt_count": 0,
    "phase_progress_count": 0,
    "student_response_count": 0,
    "concept_evidence_count": 0,
    "attempt_item_count": 0,
    "quest_reflection_count": 0,
    "quest_result_count": 0,
    "team_score_snapshot_count": 0,
    "student_join_request_count": 0,
    "non_teacher_session_count": 0,
    "join_attempt_count": 0,
    "recovery_attempt_count": 0,
    "group_identity_receipt_count": 0,
    "group_media_asset_count": 0,
    "cohort_quest_launch_count": 0,
    "cohort_quest_launch_receipt_count": 0,
    "teacher_control_audit_count": 0,
    "teacher_roster_control_receipt_count": 0,
    "group_image_object_count": 0,
    "student_login_credentials_absent": true,
    "student_login_attempts_absent": true,
    "canonical_group_count": 5,
    "canonical_groups_ready": true
  }'::jsonb then
    raise exception using
      errcode = 'P0001', message = 'reset verification rejected';
  end if;
exception when others then
  raise exception using
    errcode = 'P0001', message = '[FRCQ_RESET_PHASE=' || phase || ']';
end
$reset$;
