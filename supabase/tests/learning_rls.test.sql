begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_schema(
  'content',
  'protected learning content uses a private content schema'
);

select has_table(
  'content',
  'content_versions',
  'immutable content versions are stored privately'
);

select has_table(
  'content',
  'learning_items',
  'protected stems and answer metadata are stored privately'
);

select has_table(
  'content',
  'item_options',
  'protected options are stored privately'
);

select has_table(
  'content',
  'item_source_refs',
  'protected source references are stored privately'
);

select ok(
  not has_schema_privilege('anon', 'content', 'usage'),
  'anonymous callers have no content schema usage'
);

select ok(
  not has_schema_privilege('authenticated', 'content', 'usage'),
  'authenticated browsers have no content schema usage'
);

select ok(
  not has_table_privilege('anon', 'content.learning_items', 'select'),
  'anonymous callers cannot select protected items'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'content.learning_items',
    'select'
  ),
  'authenticated browsers cannot select protected items'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.import_learning_content(jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.import_learning_content(jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.import_learning_content(jsonb)',
    'execute'
  ),
  'only the service role can execute the protected import transaction'
);

create function pg_temp.synthetic_content_bank()
returns jsonb
language sql
as $$
  with generated_items as (
    select jsonb_build_object(
      'id', 'C' || concept_number || '-Q' || question_number,
      'conceptId', 'C' || concept_number,
      'form', case question_number
        when 1 then 'diagnostic'
        when 2 then 'practice'
        else 'final'
      end,
      'stem', 'Synthetic protected item ' || concept_number || '-' || question_number ||
        ' contains no course-related content.',
      'interaction', jsonb_build_object(
        'kind', 'single-choice',
        'options', jsonb_build_array(
          jsonb_build_object('id', 'A', 'text', 'Synthetic option A'),
          jsonb_build_object('id', 'B', 'text', 'Synthetic option B'),
          jsonb_build_object('id', 'C', 'text', 'Synthetic option C')
        ),
        'correctOptionIds', jsonb_build_array('A')
      ),
      'rationale', 'Synthetic option A is marked correct only for database testing.',
      'misconceptionTags', jsonb_build_array('C' || concept_number || '-M1'),
      'sourceRefs', jsonb_build_array(
        jsonb_build_object(
          'document', 'overview-ict',
          'pageStart', concept_number
        )
      )
    ) as item
    from generate_series(1, 8) as concept_number
    cross join generate_series(1, 3) as question_number
  )
  select jsonb_build_object(
    'version', 'public-synthetic-database-v1',
    'items', jsonb_agg(item order by item->>'id')
  )
  from generated_items
$$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  public.import_learning_content(pg_temp.synthetic_content_bank()),
  jsonb_build_object(
    'version', 'public-synthetic-database-v1',
    'itemCount', 24,
    'conceptCount', 8
  ),
  'the service role imports exactly 24 items across eight concepts'
);

select lives_ok(
  $$select public.import_learning_content(pg_temp.synthetic_content_bank())$$,
  'repeating an identical content version is idempotent'
);

reset role;

select results_eq(
  $$select count(*)::bigint
    from content.learning_items
    where version_id = (
      select id
      from content.content_versions
      where version_key = 'public-synthetic-database-v1'
    )$$,
  array[24::bigint],
  'the import transaction stores exactly 24 protected items'
);

select results_eq(
  $$select count(*)::bigint
    from content.concepts
    where version_id = (
      select id
      from content.content_versions
      where version_key = 'public-synthetic-database-v1'
    )$$,
  array[8::bigint],
  'the import transaction stores exactly eight protected concepts'
);

select * from finish();
rollback;
