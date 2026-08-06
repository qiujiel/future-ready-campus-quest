alter function public.submit_learning_response(
  uuid,
  uuid,
  uuid,
  text[],
  integer,
  text
) rename to submit_learning_response_base;

revoke all on function public.submit_learning_response_base(
  uuid,
  uuid,
  uuid,
  text[],
  integer,
  text
) from public, anon, authenticated;

create function public.submit_learning_response(
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
  v_result jsonb;
begin
  v_result := public.submit_learning_response_base(
    p_attempt_id,
    p_assignment_id,
    p_idempotency_key,
    p_selected_option_ids,
    p_client_sequence,
    p_confidence
  );

  if v_result->>'nextPhase' = 'retry'
    and coalesce(
      (
        select bool_and(student_responses.correct)
        from public.student_responses
        where student_responses.attempt_id = p_attempt_id
          and student_responses.phase = 'final'
      ),
      false
    )
  then
    update public.quest_attempts
    set current_phase = 'reflection'
    where id = p_attempt_id
      and student_id = auth.uid()
      and status = 'active'
      and current_phase = 'retry';

    if found then
      v_result := jsonb_set(
        v_result,
        '{nextPhase}',
        '"reflection"'::jsonb
      );

      update public.student_responses
      set result_payload = v_result
      where attempt_id = p_attempt_id
        and idempotency_key = p_idempotency_key;
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.submit_learning_response(
  uuid,
  uuid,
  uuid,
  text[],
  integer,
  text
) from public, anon;

grant execute on function public.submit_learning_response(
  uuid,
  uuid,
  uuid,
  text[],
  integer,
  text
) to authenticated;

comment on function public.submit_learning_response(
  uuid,
  uuid,
  uuid,
  text[],
  integer,
  text
) is
  'Atomically scores a response and skips retry when the final has no misconceptions.';
