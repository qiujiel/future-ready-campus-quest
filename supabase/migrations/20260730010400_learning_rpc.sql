create table public.attempt_items (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references public.quest_attempts(id)
    on delete cascade,
  item_id uuid not null
    references content.learning_items(id)
    on delete restrict,
  phase text not null
    check (phase in ('diagnostic', 'mission', 'final', 'retry')),
  sequence smallint not null check (sequence > 0),
  support_state text not null default 'developing'
    check (support_state in ('needs_support', 'developing', 'secure')),
  delivered_at timestamptz,
  submitted_at timestamptz,
  unique (attempt_id, phase, sequence),
  unique (attempt_id, item_id, phase)
);

create index attempt_items_attempt_phase_idx
  on public.attempt_items (attempt_id, phase, sequence);

alter table public.student_responses
  add column assignment_id uuid
    references public.attempt_items(id)
    on delete restrict,
  add column confidence text
    check (
      confidence is null
      or confidence in ('unsure', 'somewhat_sure', 'very_sure')
    ),
  add column result_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_payload) = 'object');

alter table public.student_responses
  alter column assignment_id set not null,
  add constraint student_responses_assignment_unique unique (assignment_id);

alter table public.concept_evidence
  add column support_state text not null default 'developing'
    check (support_state in ('needs_support', 'developing', 'secure'));

revoke all on table public.attempt_items from anon, authenticated;
grant select on table public.attempt_items to authenticated;

alter table public.attempt_items enable row level security;

create policy attempt_items_student_read
on public.attempt_items
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = attempt_items.attempt_id
      and quest_attempts.student_id = auth.uid()
  )
);

create policy attempt_items_teacher_read
on public.attempt_items
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = attempt_items.attempt_id
      and public.teacher_owns_cohort(quest_attempts.cohort_id)
  )
);

create or replace function public.ensure_learning_assignments(
  p_attempt_id uuid,
  p_phase text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_version_id uuid;
  v_required_item_count smallint;
begin
  select content_version_id
  into v_content_version_id
  from public.quest_attempts
  where id = p_attempt_id;

  if v_content_version_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_NOT_AVAILABLE';
  end if;

  if p_phase = 'diagnostic' then
    insert into public.attempt_items (
      attempt_id,
      item_id,
      phase,
      sequence,
      support_state
    )
    select
      p_attempt_id,
      ranked.id,
      'diagnostic',
      ranked.sequence,
      'developing'
    from (
      select
        learning_items.id,
        row_number() over (
          order by md5(p_attempt_id::text || ':' || learning_items.item_key)
        )::smallint as sequence
      from content.learning_items
      where learning_items.version_id = v_content_version_id
        and learning_items.form = 'diagnostic'
    ) as ranked
    on conflict do nothing;
  elsif p_phase = 'mission' then
    insert into public.attempt_items (
      attempt_id,
      item_id,
      phase,
      sequence,
      support_state
    )
    with candidates as (
      select
        learning_items.id,
        learning_items.item_key,
        coalesce(
          concept_evidence.support_state,
          'developing'
        ) as support_state
      from content.learning_items
      left join public.concept_evidence
        on concept_evidence.attempt_id = p_attempt_id
        and concept_evidence.concept_id = learning_items.concept_id
        and concept_evidence.phase = 'diagnostic'
      where learning_items.version_id = v_content_version_id
        and learning_items.form = 'practice'
      order by
        case coalesce(concept_evidence.support_state, 'developing')
          when 'needs_support' then 0
          when 'developing' then 1
          else 2
        end,
        md5(p_attempt_id::text || ':mission:' || learning_items.item_key)
      limit 6
    ),
    ranked as (
      select
        candidates.id,
        candidates.support_state,
        row_number() over (
          order by
            case candidates.support_state
              when 'needs_support' then 0
              when 'developing' then 1
              else 2
            end,
            md5(p_attempt_id::text || ':mission:' || candidates.item_key)
        )::smallint as sequence
      from candidates
    )
    select
      p_attempt_id,
      ranked.id,
      'mission',
      ranked.sequence,
      ranked.support_state
    from ranked
    on conflict do nothing;
  elsif p_phase = 'final' then
    insert into public.attempt_items (
      attempt_id,
      item_id,
      phase,
      sequence,
      support_state
    )
    select
      p_attempt_id,
      ranked.id,
      'final',
      ranked.sequence,
      ranked.support_state
    from (
      select
        learning_items.id,
        coalesce(
          concept_evidence.support_state,
          'developing'
        ) as support_state,
        row_number() over (
          order by md5(
            p_attempt_id::text || ':final:' || learning_items.item_key
          )
        )::smallint as sequence
      from content.learning_items
      left join public.concept_evidence
        on concept_evidence.attempt_id = p_attempt_id
        and concept_evidence.concept_id = learning_items.concept_id
        and concept_evidence.phase = 'diagnostic'
      where learning_items.version_id = v_content_version_id
        and learning_items.form = 'final'
    ) as ranked
    on conflict do nothing;
  elsif p_phase = 'retry' then
    insert into public.attempt_items (
      attempt_id,
      item_id,
      phase,
      sequence,
      support_state
    )
    with missed_concepts as (
      select distinct
        learning_items.concept_id,
        min(student_responses.submitted_at) as first_missed_at
      from public.student_responses
      join content.learning_items
        on learning_items.id = student_responses.item_id
      where student_responses.attempt_id = p_attempt_id
        and student_responses.phase = 'final'
        and not student_responses.correct
      group by learning_items.concept_id
      order by first_missed_at, learning_items.concept_id
      limit 3
    ),
    ranked as (
      select
        learning_items.id,
        row_number() over (
          order by
            missed_concepts.first_missed_at,
            learning_items.concept_id
        )::smallint as sequence
      from missed_concepts
      join content.learning_items
        on learning_items.version_id = v_content_version_id
        and learning_items.concept_id = missed_concepts.concept_id
        and learning_items.form = 'practice'
    )
    select
      p_attempt_id,
      ranked.id,
      'retry',
      ranked.sequence,
      'needs_support'
    from ranked
    on conflict do nothing;
  else
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_NOT_AVAILABLE';
  end if;

  select count(*)::smallint
  into v_required_item_count
  from public.attempt_items
  where attempt_id = p_attempt_id
    and phase = p_phase;

  insert into public.phase_progress (
    attempt_id,
    phase,
    required_item_count,
    completed_item_count
  )
  values (
    p_attempt_id,
    p_phase,
    v_required_item_count,
    0
  )
  on conflict (attempt_id, phase) do update
  set required_item_count = excluded.required_item_count;
end;
$$;

create or replace function public.get_next_learning_item(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.quest_attempts%rowtype;
  v_assignment public.attempt_items%rowtype;
  v_item content.learning_items%rowtype;
  v_source_label text;
begin
  select *
  into v_attempt
  from public.quest_attempts
  where id = p_attempt_id
    and student_id = auth.uid()
    and status = 'active'
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_NOT_AVAILABLE';
  end if;

  if v_attempt.current_phase not in ('diagnostic', 'mission', 'final', 'retry') then
    return null;
  end if;

  perform public.ensure_learning_assignments(
    v_attempt.id,
    v_attempt.current_phase
  );

  select *
  into v_assignment
  from public.attempt_items
  where attempt_id = v_attempt.id
    and phase = v_attempt.current_phase
    and submitted_at is null
  order by sequence
  limit 1
  for update;

  if not found then
    return null;
  end if;

  update public.attempt_items
  set delivered_at = coalesce(delivered_at, now())
  where id = v_assignment.id
  returning * into v_assignment;

  select *
  into strict v_item
  from content.learning_items
  where id = v_assignment.item_id;

  select
    item_source_refs.source_document || ' p. ' ||
      item_source_refs.page_start::text
  into v_source_label
  from content.item_source_refs
  where item_source_refs.item_id = v_item.id
  order by item_source_refs.source_document, item_source_refs.page_start
  limit 1;

  return jsonb_build_object(
    'assignmentId', v_assignment.id,
    'itemId', v_item.item_key,
    'conceptId', v_item.concept_id,
    'phase', v_assignment.phase,
    'formative', v_assignment.phase = 'retry',
    'stem', v_item.stem,
    'interaction', v_item.interaction_payload -
      array[
        'correctOptionIds',
        'correctOrderIds',
        'correctCategoryByPrompt'
      ],
    'support', jsonb_strip_nulls(
      jsonb_build_object(
        'sourcePageLabel', v_source_label
      )
    )
  );
end;
$$;

create or replace function public.submit_learning_response(
  p_attempt_id uuid,
  p_assignment_id uuid,
  p_idempotency_key uuid,
  p_selected_option_ids text[],
  p_client_sequence integer,
  p_confidence text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.quest_attempts%rowtype;
  v_assignment public.attempt_items%rowtype;
  v_item content.learning_items%rowtype;
  v_existing_result jsonb;
  v_expected_array text[];
  v_selected_array text[];
  v_selected_object jsonb := '{}'::jsonb;
  v_selection text;
  v_separator_position integer;
  v_correct boolean;
  v_misconception_tag text;
  v_support_state text;
  v_completed_item_count smallint;
  v_required_item_count smallint;
  v_next_phase text;
  v_next_duration interval;
  v_response_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  select *
  into v_attempt
  from public.quest_attempts
  where id = p_attempt_id
    and student_id = auth.uid()
    and status = 'active'
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_NOT_AVAILABLE';
  end if;

  select result_payload
  into v_existing_result
  from public.student_responses
  where attempt_id = v_attempt.id
    and idempotency_key = p_idempotency_key;

  if found then
    return v_existing_result;
  end if;

  if p_client_sequence is null
    or p_client_sequence <> v_attempt.last_accepted_sequence + 1
  then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_SEQUENCE';
  end if;

  if p_selected_option_ids is null
    or cardinality(p_selected_option_ids) < 1
    or exists (
      select 1
      from unnest(p_selected_option_ids) as selected(value)
      where btrim(selected.value) = ''
    )
    or (
      p_confidence is not null
      and p_confidence not in (
        'unsure',
        'somewhat_sure',
        'very_sure'
      )
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_RESPONSE';
  end if;

  select *
  into v_assignment
  from public.attempt_items
  where id = p_assignment_id
    and attempt_id = v_attempt.id
    and phase = v_attempt.current_phase
    and submitted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_NOT_AVAILABLE';
  end if;

  select *
  into strict v_item
  from content.learning_items
  where id = v_assignment.item_id;

  if v_item.interaction_kind in ('single-choice', 'multi-select') then
    select array_agg(answer.value order by answer.value)
    into v_expected_array
    from jsonb_array_elements_text(v_item.correct_response)
      as answer(value);

    select array_agg(selected.value order by selected.value)
    into v_selected_array
    from unnest(p_selected_option_ids) as selected(value);

    v_correct := v_selected_array = v_expected_array;
  elsif v_item.interaction_kind = 'scenario-sort' then
    select array_agg(answer.value order by answer.position)
    into v_expected_array
    from jsonb_array_elements_text(v_item.correct_response)
      with ordinality as answer(value, position);

    v_correct := p_selected_option_ids = v_expected_array;
  elsif v_item.interaction_kind = 'classification' then
    foreach v_selection in array p_selected_option_ids
    loop
      v_separator_position := strpos(v_selection, '=');
      if v_separator_position < 2
        or v_separator_position = char_length(v_selection)
      then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_RESPONSE';
      end if;
      v_selected_object := v_selected_object || jsonb_build_object(
        left(v_selection, v_separator_position - 1),
        substring(v_selection from v_separator_position + 1)
      );
    end loop;

    v_correct :=
      v_selected_object = v_item.correct_response
      and (
        select count(distinct split_part(selected.value, '=', 1))
        from unnest(p_selected_option_ids) as selected(value)
      ) = cardinality(p_selected_option_ids);
  else
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_RESPONSE';
  end if;

  v_misconception_tag := case
    when v_correct then null
    else v_item.misconception_tags[1]
  end;
  v_support_state := case
    when not v_correct then 'needs_support'
    when p_confidence = 'very_sure' then 'secure'
    when p_confidence = 'unsure' then 'needs_support'
    else 'developing'
  end;

  insert into public.concept_evidence (
    attempt_id,
    concept_id,
    phase,
    correct_count,
    total_count,
    support_state
  )
  values (
    v_attempt.id,
    v_item.concept_id,
    v_assignment.phase,
    case when v_correct then 1 else 0 end,
    1,
    v_support_state
  )
  on conflict (attempt_id, concept_id, phase) do update
  set
    correct_count = concept_evidence.correct_count +
      excluded.correct_count,
    total_count = concept_evidence.total_count + 1,
    support_state = excluded.support_state,
    updated_at = now();

  update public.attempt_items
  set submitted_at = now()
  where id = v_assignment.id;

  update public.phase_progress
  set completed_item_count = completed_item_count + 1
  where attempt_id = v_attempt.id
    and phase = v_assignment.phase
  returning completed_item_count, required_item_count
  into v_completed_item_count, v_required_item_count;

  v_next_phase := v_attempt.current_phase;
  if v_required_item_count > 0
    and v_completed_item_count = v_required_item_count
  then
    update public.phase_progress
    set completed_at = now()
    where attempt_id = v_attempt.id
      and phase = v_assignment.phase;

    if v_attempt.current_phase = 'diagnostic' then
      v_next_phase := 'mission';
      v_next_duration := interval '14 minutes';
    elsif v_attempt.current_phase = 'mission' then
      v_next_phase := 'final';
      v_next_duration := interval '6 minutes';
    elsif v_attempt.current_phase = 'final' then
      v_next_phase := 'retry';
      v_next_duration := interval '3 minutes';
    elsif v_attempt.current_phase = 'retry' then
      v_next_phase := 'reflection';
      v_next_duration := null;
    end if;
  end if;

  update public.quest_attempts
  set
    last_accepted_sequence = p_client_sequence,
    current_phase = v_next_phase,
    phase_started_at = case
      when v_next_phase <> v_attempt.current_phase then now()
      else phase_started_at
    end,
    phase_deadline_at = case
      when v_next_phase <> v_attempt.current_phase
        and v_next_duration is not null
        then now() + v_next_duration
      else phase_deadline_at
    end
  where id = v_attempt.id;

  v_result := jsonb_build_object(
    'responseId', v_response_id,
    'correct', v_correct,
    'formative', v_assignment.phase = 'retry',
    'explanation', v_item.rationale,
    'misconceptionTag', v_misconception_tag,
    'conceptState', v_support_state,
    'nextPhase', v_next_phase
  );

  insert into public.student_responses (
    id,
    attempt_id,
    student_id,
    item_id,
    assignment_id,
    phase,
    selected_option_ids,
    correct,
    misconception_tag,
    confidence,
    idempotency_key,
    client_sequence,
    result_payload
  )
  values (
    v_response_id,
    v_attempt.id,
    v_attempt.student_id,
    v_item.id,
    v_assignment.id,
    v_assignment.phase,
    p_selected_option_ids,
    v_correct,
    v_misconception_tag,
    p_confidence,
    p_idempotency_key,
    p_client_sequence,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.ensure_learning_assignments(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_next_learning_item(uuid)
  from public, anon;
revoke all on function public.submit_learning_response(
  uuid,
  uuid,
  uuid,
  text[],
  integer,
  text
) from public, anon;

grant execute on function public.get_next_learning_item(uuid)
  to authenticated;
grant execute on function public.submit_learning_response(
  uuid,
  uuid,
  uuid,
  text[],
  integer,
  text
) to authenticated;

comment on table public.attempt_items is
  'Server-owned immutable assignment schedule for each learning phase.';
comment on function public.get_next_learning_item(uuid) is
  'Returns only the current sanitized learning item for its owning student.';
comment on function public.submit_learning_response(
  uuid,
  uuid,
  uuid,
  text[],
  integer,
  text
) is
  'Atomically authorizes, scores, records, and advances one response.';
