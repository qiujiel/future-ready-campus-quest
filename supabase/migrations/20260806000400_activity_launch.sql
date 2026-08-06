alter table public.student_private_profiles
  add column activity_reset_at timestamptz;

create table public.cohort_quest_launches (
  cohort_id uuid primary key references public.cohorts(id) on delete cascade,
  content_version_id uuid not null
    references content.content_versions(id) on delete restrict,
  launched_at timestamptz not null default now(),
  launched_by uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null unique
);

create table private.cohort_quest_launch_receipts (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_key)
);

revoke all on table public.cohort_quest_launches
  from public, anon, authenticated;
revoke all on table private.cohort_quest_launch_receipts
  from public, anon, authenticated;

alter table public.cohort_quest_launches enable row level security;
alter table public.cohort_quest_launches force row level security;
grant select on table public.cohort_quest_launches to authenticated;

create policy cohort_quest_launches_teacher_read
on public.cohort_quest_launches
for select
to authenticated
using (public.teacher_owns_cohort(cohort_id));

create policy cohort_quest_launches_student_read
on public.cohort_quest_launches
for select
to authenticated
using (public.student_in_cohort(cohort_id));

create or replace function public.record_student_activity_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'abandoned' then
    update public.student_private_profiles
    set activity_reset_at = clock_timestamp()
    where student_id = new.student_id
      and cohort_id = new.cohort_id
      and removed_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.record_student_activity_reset() from public;

create trigger quest_attempts_record_student_reset
after update of status on public.quest_attempts
for each row execute function public.record_student_activity_reset();

create or replace function public.launch_cohort_quest(
  p_cohort_id uuid,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing private.cohort_quest_launch_receipts;
  v_launch public.cohort_quest_launches;
  v_content_version_id uuid;
  v_affected integer := 0;
  v_receipt jsonb;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'CONTROL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cohorts
    where id = p_cohort_id and archived_at is not null
  ) or exists (
    select 1 from public.cohort_session_controls
    where cohort_id = p_cohort_id and closed_at is not null
  ) then
    raise exception 'CONTROL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_cohort_id::text, 0));
  select * into v_existing
  from private.cohort_quest_launch_receipts
  where actor_user_id = auth.uid() and request_key = p_request_key;
  if found then
    if v_existing.cohort_id <> p_cohort_id then
      raise exception 'INVALID_CONTROL' using errcode = '22023';
    end if;
    return v_existing.receipt;
  end if;

  select * into v_launch
  from public.cohort_quest_launches
  where cohort_id = p_cohort_id
  for update;
  if found then
    v_content_version_id := v_launch.content_version_id;
  else
    select versions.id into v_content_version_id
    from content.content_versions as versions
    where versions.item_count = 24
      and versions.concept_count = 8
      and (
        select count(*) from content.learning_items as items
        where items.version_id = versions.id
      ) = 24
      and (
        select count(distinct items.concept_id)
        from content.learning_items as items
        where items.version_id = versions.id
      ) = 8
      and not exists (
        select 1
        from (
          select items.form, count(*) as item_count
          from content.learning_items as items
          where items.version_id = versions.id
          group by items.form
        ) as coverage
        where coverage.form not in ('diagnostic', 'practice', 'final')
          or coverage.item_count <> 8
      )
      and (
        select count(distinct items.form)
        from content.learning_items as items
        where items.version_id = versions.id
      ) = 3
    order by versions.imported_at desc, versions.id desc
    limit 1;
    if v_content_version_id is null then
      raise exception 'CONTENT_NOT_READY' using errcode = 'P0001';
    end if;
    insert into public.cohort_quest_launches (
      cohort_id, content_version_id, launched_by, request_key
    ) values (
      p_cohort_id, v_content_version_id, auth.uid(), p_request_key
    ) returning * into v_launch;
  end if;

  insert into public.cohort_session_controls (
    cohort_id, quest_starts_allowed, updated_by
  ) values (
    p_cohort_id, true, auth.uid()
  )
  on conflict (cohort_id) do update
  set quest_starts_allowed = true,
      updated_at = now(),
      updated_by = auth.uid()
  where public.cohort_session_controls.closed_at is null;

  insert into public.quest_attempts (
    student_id,
    cohort_id,
    content_version_id,
    current_phase,
    phase_started_at,
    phase_deadline_at
  )
  select
    profiles.student_id,
    p_cohort_id,
    v_content_version_id,
    'diagnostic',
    now(),
    now() + interval '5 minutes'
  from public.student_private_profiles as profiles
  where profiles.cohort_id = p_cohort_id
    and profiles.removed_at is null
    and not exists (
      select 1 from public.quest_attempts as active_attempts
      where active_attempts.cohort_id = p_cohort_id
        and active_attempts.student_id = profiles.student_id
        and active_attempts.status = 'active'
    )
    and (
      not exists (
        select 1 from public.quest_attempts as prior_attempts
        where prior_attempts.cohort_id = p_cohort_id
          and prior_attempts.student_id = profiles.student_id
      )
      or (
        profiles.activity_reset_at is not null
        and not exists (
          select 1 from public.quest_attempts as reset_attempts
          where reset_attempts.cohort_id = p_cohort_id
            and reset_attempts.student_id = profiles.student_id
            and reset_attempts.started_at >= profiles.activity_reset_at
        )
      )
    );
  get diagnostics v_affected = row_count;

  update public.student_private_profiles as profiles
  set activity_reset_at = null
  where profiles.cohort_id = p_cohort_id
    and profiles.activity_reset_at is not null
    and exists (
      select 1 from public.quest_attempts as attempts
      where attempts.cohort_id = p_cohort_id
        and attempts.student_id = profiles.student_id
        and attempts.status = 'active'
        and attempts.started_at >= profiles.activity_reset_at
    );

  v_receipt := jsonb_build_object(
    'affected', v_affected,
    'actionState', 'launched',
    'launchedAt', v_launch.launched_at
  );
  insert into public.audit_events (
    actor_user_id, cohort_id, event_type, entity_id, request_key
  ) values (
    auth.uid(), p_cohort_id, 'quest.launched', p_cohort_id, p_request_key
  );
  insert into private.cohort_quest_launch_receipts (
    actor_user_id, request_key, cohort_id, receipt
  ) values (
    auth.uid(), p_request_key, p_cohort_id, v_receipt
  );
  return v_receipt;
end;
$$;

create or replace function public.ensure_student_quest_attempt()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.student_private_profiles;
  v_launch public.cohort_quest_launches;
  v_attempt public.quest_attempts;
  v_attempt_id uuid;
begin
  if public.current_role() is distinct from 'student' then
    raise exception 'ATTEMPT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select * into v_profile
  from public.student_private_profiles
  where student_id = auth.uid() and removed_at is null
  for update;
  if not found then
    raise exception 'ATTEMPT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select * into v_attempt
  from public.quest_attempts
  where student_id = auth.uid()
    and cohort_id = v_profile.cohort_id
    and status = 'active'
  order by started_at desc
  limit 1;
  if found then return v_attempt.id; end if;

  select * into v_launch
  from public.cohort_quest_launches
  where cohort_id = v_profile.cohort_id;
  if not found then return null; end if;
  if exists (
    select 1 from public.cohort_session_controls
    where cohort_id = v_profile.cohort_id
      and (not quest_starts_allowed or closed_at is not null)
  ) then
    return null;
  end if;

  select * into v_attempt
  from public.quest_attempts
  where student_id = auth.uid()
    and cohort_id = v_profile.cohort_id
  order by started_at desc
  limit 1;
  if found and (
    v_profile.activity_reset_at is null
    or v_attempt.started_at >= v_profile.activity_reset_at
  ) then
    return v_attempt.id;
  end if;

  insert into public.quest_attempts (
    student_id, cohort_id, content_version_id,
    current_phase, phase_started_at, phase_deadline_at
  ) values (
    auth.uid(),
    v_profile.cohort_id,
    v_launch.content_version_id,
    'diagnostic',
    now(),
    now() + interval '5 minutes'
  ) returning id into v_attempt_id;
  update public.student_private_profiles
  set activity_reset_at = null
  where student_id = auth.uid();
  return v_attempt_id;
end;
$$;

revoke all on function public.launch_cohort_quest(uuid, uuid) from public;
revoke all on function public.ensure_student_quest_attempt() from public;
grant execute on function public.launch_cohort_quest(uuid, uuid)
  to authenticated;
grant execute on function public.ensure_student_quest_attempt()
  to authenticated;

comment on table public.cohort_quest_launches is
  'One immutable content-version launch per cohort; late students join that same version.';
comment on function public.ensure_student_quest_attempt() is
  'Creates only the authenticated active member''s missing post-launch or post-reset attempt.';
