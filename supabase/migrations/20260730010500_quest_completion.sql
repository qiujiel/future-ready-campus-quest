create table public.quest_reflections (
  attempt_id uuid primary key
    references public.quest_attempts(id)
    on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  prompt_concept_id text not null check (prompt_concept_id ~ '^C[1-8]$'),
  reflection_choice text not null
    check (reflection_choice in ('apply', 'discuss', 'revisit')),
  reflection_note text
    check (
      reflection_note is null
      or char_length(reflection_note) between 1 and 240
    ),
  idempotency_key uuid not null,
  submitted_at timestamptz not null default now(),
  unique (student_id, idempotency_key)
);

create table public.quest_results (
  attempt_id uuid primary key
    references public.quest_attempts(id)
    on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  diagnostic_correct smallint not null check (diagnostic_correct >= 0),
  diagnostic_total smallint not null check (
    diagnostic_total = 8
    and diagnostic_correct <= diagnostic_total
  ),
  final_correct smallint not null check (final_correct >= 0),
  final_total smallint not null check (
    final_total = 8
    and final_correct <= final_total
  ),
  retry_correct smallint not null check (retry_correct >= 0),
  retry_total smallint not null check (
    retry_total >= 0
    and retry_correct <= retry_total
  ),
  retry_formative boolean not null default true check (retry_formative),
  final_mastery smallint not null check (final_mastery between 0 and 100),
  improvement smallint not null check (improvement between 0 and 100),
  mission_completion smallint not null
    check (mission_completion between 0 and 100),
  reflection_completion smallint not null
    check (reflection_completion in (0, 100)),
  individual_contribution smallint not null
    check (individual_contribution between 0 and 100),
  formula_version text not null
    check (formula_version = 'team-score-60-25-10-5-v1'),
  idempotency_key uuid not null,
  result_payload jsonb not null check (jsonb_typeof(result_payload) = 'object'),
  completed_at timestamptz not null default now(),
  unique (student_id, idempotency_key)
);

create index quest_results_group_id_idx
  on public.quest_results (group_id);
create index quest_results_cohort_id_idx
  on public.quest_results (cohort_id);

create table public.team_score_snapshots (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  team_score smallint check (team_score between 0 and 100),
  completion_state text not null
    check (completion_state in ('updating', 'complete')),
  eligible_member_count smallint not null check (eligible_member_count >= 0),
  completed_member_count smallint not null check (
    completed_member_count >= 0
    and completed_member_count <= eligible_member_count
  ),
  joined_member_count smallint not null check (joined_member_count >= 0),
  formula_version text not null
    check (formula_version = 'team-score-60-25-10-5-v1'),
  calculated_at timestamptz not null default now(),
  primary key (cohort_id, group_id)
);

revoke all on table public.quest_reflections from anon, authenticated;
revoke all on table public.quest_results from anon, authenticated;
revoke all on table public.team_score_snapshots from anon, authenticated;

grant select on table public.quest_reflections to authenticated;
grant select on table public.quest_results to authenticated;
grant select on table public.team_score_snapshots to authenticated;

alter table public.quest_reflections enable row level security;
alter table public.quest_results enable row level security;
alter table public.team_score_snapshots enable row level security;

create policy quest_reflections_student_read
on public.quest_reflections
for select
to authenticated
using (student_id = auth.uid());

create policy quest_reflections_teacher_read
on public.quest_reflections
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = quest_reflections.attempt_id
      and public.teacher_owns_cohort(quest_attempts.cohort_id)
  )
);

create policy quest_results_student_read
on public.quest_results
for select
to authenticated
using (student_id = auth.uid());

create policy quest_results_teacher_read
on public.quest_results
for select
to authenticated
using (public.teacher_owns_cohort(cohort_id));

create policy team_score_snapshots_cohort_read
on public.team_score_snapshots
for select
to authenticated
using (
  public.teacher_owns_cohort(cohort_id)
  or exists (
    select 1
    from public.student_private_profiles
    where student_private_profiles.student_id = auth.uid()
      and student_private_profiles.cohort_id =
        team_score_snapshots.cohort_id
  )
);

create or replace function public.get_reflection_prompt(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_concept_id text;
begin
  if not exists (
    select 1
    from public.quest_attempts
    where id = p_attempt_id
      and student_id = auth.uid()
      and status = 'active'
      and current_phase in ('retry', 'reflection')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ATTEMPT_NOT_AVAILABLE';
  end if;

  select learning_items.concept_id
  into v_concept_id
  from public.student_responses
  join content.learning_items
    on learning_items.id = student_responses.item_id
  where student_responses.attempt_id = p_attempt_id
    and student_responses.phase = 'final'
    and not student_responses.correct
  order by student_responses.submitted_at, learning_items.concept_id
  limit 1;

  if v_concept_id is null then
    select concept_id
    into v_concept_id
    from public.concept_evidence
    where attempt_id = p_attempt_id
      and phase = 'diagnostic'
    order by correct_count::numeric / greatest(total_count, 1), concept_id
    limit 1;
  end if;
  v_concept_id := coalesce(v_concept_id, 'C1');

  return jsonb_build_object(
    'conceptId', v_concept_id,
    'prompt', 'How will you use what you learned about ' ||
      v_concept_id || ' in your teaching?',
    'choices', jsonb_build_array('apply', 'discuss', 'revisit'),
    'noteMaxLength', 240
  );
end;
$$;

create or replace function public.complete_quest(
  p_attempt_id uuid,
  p_idempotency_key uuid,
  p_reflection_choice text,
  p_reflection_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.quest_attempts%rowtype;
  v_existing_result jsonb;
  v_group_id uuid;
  v_diagnostic_correct smallint;
  v_diagnostic_total smallint;
  v_final_correct smallint;
  v_final_total smallint;
  v_retry_correct smallint;
  v_retry_total smallint;
  v_mission_completed smallint;
  v_mission_assigned smallint;
  v_final_mastery smallint;
  v_improvement smallint;
  v_mission_completion smallint;
  v_individual_contribution smallint;
  v_prompt_concept_id text;
  v_reflection_note text;
  v_invalid_retry_count integer;
  v_result jsonb;
  v_eligible_count smallint;
  v_completed_count smallint;
  v_joined_count smallint;
  v_team_score smallint;
begin
  select *
  into v_attempt
  from public.quest_attempts
  where id = p_attempt_id
    and student_id = auth.uid()
    and status in ('active', 'completed')
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ATTEMPT_NOT_AVAILABLE';
  end if;

  select result_payload
  into v_existing_result
  from public.quest_results
  where attempt_id = v_attempt.id;

  if found then
    return v_existing_result;
  end if;

  if v_attempt.current_phase not in ('retry', 'reflection')
    or p_reflection_choice not in ('apply', 'discuss', 'revisit')
    or p_idempotency_key is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_COMPLETION';
  end if;

  v_reflection_note := nullif(btrim(p_reflection_note), '');
  if v_reflection_note is not null
    and char_length(v_reflection_note) > 240
  then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_COMPLETION';
  end if;

  select
    coalesce(sum(correct_count), 0)::smallint,
    coalesce(sum(total_count), 0)::smallint
  into v_diagnostic_correct, v_diagnostic_total
  from public.concept_evidence
  where attempt_id = v_attempt.id
    and phase = 'diagnostic';

  select
    count(*) filter (where correct)::smallint,
    count(*)::smallint
  into v_final_correct, v_final_total
  from public.student_responses
  where attempt_id = v_attempt.id
    and phase = 'final';

  if v_diagnostic_total <> 8 or v_final_total <> 8 then
    raise exception using
      errcode = 'P0001',
      message = 'FINAL_INCOMPLETE';
  end if;

  select count(*)
  into v_invalid_retry_count
  from public.attempt_items as retry_assignment
  join content.learning_items as retry_item
    on retry_item.id = retry_assignment.item_id
  where retry_assignment.attempt_id = v_attempt.id
    and retry_assignment.phase = 'retry'
    and not exists (
      select 1
      from public.student_responses as final_response
      join content.learning_items as final_item
        on final_item.id = final_response.item_id
      where final_response.attempt_id = v_attempt.id
        and final_response.phase = 'final'
        and not final_response.correct
        and final_item.concept_id = retry_item.concept_id
    );

  if v_invalid_retry_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'RETRY_TARGET_INVALID';
  end if;

  if exists (
    select 1
    from public.attempt_items
    where attempt_id = v_attempt.id
      and phase = 'retry'
      and submitted_at is null
  ) and now() < v_attempt.phase_deadline_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'RETRY_INCOMPLETE';
  end if;

  select
    count(*) filter (where correct)::smallint,
    count(*)::smallint
  into v_retry_correct, v_retry_total
  from public.student_responses
  where attempt_id = v_attempt.id
    and phase = 'retry';

  select completed_item_count, required_item_count
  into v_mission_completed, v_mission_assigned
  from public.phase_progress
  where attempt_id = v_attempt.id
    and phase = 'mission';

  if not found or v_mission_assigned = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_COMPLETION';
  end if;

  v_final_mastery := round(
    v_final_correct::numeric / v_final_total * 100
  )::smallint;
  v_improvement := case
    when v_diagnostic_correct = 8 and v_final_correct = 8 then 100
    when v_diagnostic_correct = 8 then 0
    else round(
      greatest(0, v_final_correct - v_diagnostic_correct)::numeric /
      (8 - v_diagnostic_correct) * 100
    )::smallint
  end;
  v_mission_completion := round(
    v_mission_completed::numeric / v_mission_assigned * 100
  )::smallint;
  v_individual_contribution := round(
    v_final_mastery * 0.60 +
    v_improvement * 0.25 +
    v_mission_completion * 0.10 +
    100 * 0.05
  )::smallint;

  select learning_items.concept_id
  into v_prompt_concept_id
  from public.student_responses
  join content.learning_items
    on learning_items.id = student_responses.item_id
  where student_responses.attempt_id = v_attempt.id
    and student_responses.phase = 'final'
    and not student_responses.correct
  order by student_responses.submitted_at, learning_items.concept_id
  limit 1;

  if v_prompt_concept_id is null then
    select concept_id
    into v_prompt_concept_id
    from public.concept_evidence
    where attempt_id = v_attempt.id
      and phase = 'diagnostic'
    order by correct_count::numeric / greatest(total_count, 1), concept_id
    limit 1;
  end if;
  v_prompt_concept_id := coalesce(v_prompt_concept_id, 'C1');

  select group_id
  into strict v_group_id
  from public.student_private_profiles
  where student_id = v_attempt.student_id
    and cohort_id = v_attempt.cohort_id;

  v_result := jsonb_build_object(
    'attemptId', v_attempt.id,
    'diagnostic', jsonb_build_object(
      'correct', v_diagnostic_correct,
      'total', v_diagnostic_total
    ),
    'final', jsonb_build_object(
      'correct', v_final_correct,
      'total', v_final_total
    ),
    'retry', jsonb_build_object(
      'correct', v_retry_correct,
      'total', v_retry_total
    ),
    'retryFormative', true,
    'finalMastery', v_final_mastery,
    'improvement', v_improvement,
    'missionCompletion', v_mission_completion,
    'reflectionCompletion', 100,
    'individualContribution', v_individual_contribution,
    'formulaVersion', 'team-score-60-25-10-5-v1',
    'reflectionPromptConceptId', v_prompt_concept_id
  );

  insert into public.quest_reflections (
    attempt_id,
    student_id,
    prompt_concept_id,
    reflection_choice,
    reflection_note,
    idempotency_key
  )
  values (
    v_attempt.id,
    v_attempt.student_id,
    v_prompt_concept_id,
    p_reflection_choice,
    v_reflection_note,
    p_idempotency_key
  );

  insert into public.quest_results (
    attempt_id,
    student_id,
    cohort_id,
    group_id,
    diagnostic_correct,
    diagnostic_total,
    final_correct,
    final_total,
    retry_correct,
    retry_total,
    retry_formative,
    final_mastery,
    improvement,
    mission_completion,
    reflection_completion,
    individual_contribution,
    formula_version,
    idempotency_key,
    result_payload
  )
  values (
    v_attempt.id,
    v_attempt.student_id,
    v_attempt.cohort_id,
    v_group_id,
    v_diagnostic_correct,
    v_diagnostic_total,
    v_final_correct,
    v_final_total,
    v_retry_correct,
    v_retry_total,
    true,
    v_final_mastery,
    v_improvement,
    v_mission_completion,
    100,
    v_individual_contribution,
    'team-score-60-25-10-5-v1',
    p_idempotency_key,
    v_result
  );

  update public.quest_attempts
  set
    status = 'completed',
    current_phase = 'reflection',
    completed_at = now()
  where id = v_attempt.id;

  select count(*)::smallint
  into v_eligible_count
  from public.quest_attempts
  join public.student_private_profiles
    on student_private_profiles.student_id = quest_attempts.student_id
    and student_private_profiles.cohort_id = quest_attempts.cohort_id
  join public.phase_progress
    on phase_progress.attempt_id = quest_attempts.id
    and phase_progress.phase = 'diagnostic'
    and phase_progress.required_item_count > 0
    and phase_progress.completed_item_count =
      phase_progress.required_item_count
  where student_private_profiles.group_id = v_group_id;

  select count(*)::smallint
  into v_completed_count
  from public.quest_results
  where group_id = v_group_id;

  select count(*)::smallint
  into v_joined_count
  from public.student_private_profiles
  where group_id = v_group_id;

  if v_eligible_count > 0 and v_completed_count = v_eligible_count then
    select round(avg(individual_contribution))::smallint
    into v_team_score
    from public.quest_results
    where group_id = v_group_id;
  else
    v_team_score := null;
  end if;

  insert into public.team_score_snapshots (
    cohort_id,
    group_id,
    team_score,
    completion_state,
    eligible_member_count,
    completed_member_count,
    joined_member_count,
    formula_version
  )
  values (
    v_attempt.cohort_id,
    v_group_id,
    v_team_score,
    case when v_team_score is null then 'updating' else 'complete' end,
    v_eligible_count,
    v_completed_count,
    v_joined_count,
    'team-score-60-25-10-5-v1'
  )
  on conflict (cohort_id, group_id) do update
  set
    team_score = excluded.team_score,
    completion_state = excluded.completion_state,
    eligible_member_count = excluded.eligible_member_count,
    completed_member_count = excluded.completed_member_count,
    joined_member_count = excluded.joined_member_count,
    formula_version = excluded.formula_version,
    calculated_at = now();

  return v_result;
end;
$$;

revoke all on function public.complete_quest(uuid, uuid, text, text)
  from public, anon;
revoke all on function public.get_reflection_prompt(uuid)
  from public, anon;
grant execute on function public.get_reflection_prompt(uuid)
  to authenticated;
grant execute on function public.complete_quest(uuid, uuid, text, text)
  to authenticated;

comment on table public.quest_reflections is
  'Private structured reflection and optional learner note.';
comment on table public.quest_results is
  'Immutable individual scoring components with retry evidence kept formative.';
comment on table public.team_score_snapshots is
  'Public cohort aggregate only; no private member contributions or speed fields.';
