create schema if not exists content;

revoke all on schema content from public, anon, authenticated;

create table content.content_versions (
  id uuid primary key default gen_random_uuid(),
  version_key text not null unique
    check (char_length(btrim(version_key)) between 3 and 120),
  payload_digest bytea not null,
  item_count smallint not null check (item_count = 24),
  concept_count smallint not null check (concept_count = 8),
  imported_at timestamptz not null default now()
);

create table content.concepts (
  version_id uuid not null
    references content.content_versions(id)
    on delete restrict,
  concept_id text not null check (concept_id ~ '^C[1-8]$'),
  primary key (version_id, concept_id)
);

create table content.learning_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null
    references content.content_versions(id)
    on delete restrict,
  item_key text not null check (item_key ~ '^C[1-8]-Q[1-3]$'),
  concept_id text not null check (concept_id ~ '^C[1-8]$'),
  form text not null check (form in ('diagnostic', 'practice', 'final')),
  stem text not null check (char_length(btrim(stem)) >= 20),
  interaction_kind text not null check (
    interaction_kind in (
      'single-choice',
      'multi-select',
      'scenario-sort',
      'classification'
    )
  ),
  interaction_payload jsonb not null
    check (jsonb_typeof(interaction_payload) = 'object'),
  correct_response jsonb not null,
  rationale text not null check (char_length(btrim(rationale)) >= 20),
  misconception_tags text[] not null
    check (cardinality(misconception_tags) >= 1),
  unique (version_id, item_key),
  constraint learning_items_concept_fk
    foreign key (version_id, concept_id)
    references content.concepts(version_id, concept_id)
    on delete restrict
);

create index learning_items_version_concept_idx
  on content.learning_items (version_id, concept_id);
create index learning_items_version_form_idx
  on content.learning_items (version_id, form);

create table content.item_options (
  item_id uuid not null
    references content.learning_items(id)
    on delete cascade,
  option_id text not null,
  option_text text not null check (char_length(btrim(option_text)) >= 1),
  option_kind text not null
    check (option_kind in ('option', 'classification-prompt')),
  option_order smallint not null check (option_order >= 1),
  correct_category text,
  primary key (item_id, option_id),
  unique (item_id, option_order)
);

create table content.item_source_refs (
  item_id uuid not null
    references content.learning_items(id)
    on delete cascade,
  source_document text not null
    check (source_document in ('overview-ict', 'quality-learning')),
  page_start smallint not null check (page_start > 0),
  page_end smallint check (page_end is null or page_end >= page_start),
  primary key (item_id, source_document, page_start)
);

create or replace function public.import_learning_content(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_key text;
  v_items jsonb;
  v_payload_digest bytea;
  v_version_id uuid;
  v_existing_digest bytea;
  v_item jsonb;
  v_item_uuid uuid;
  v_interaction jsonb;
  v_interaction_kind text;
  v_option jsonb;
  v_source_ref jsonb;
  v_option_order smallint;
  v_item_count integer;
  v_concept_count integer;
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'protected content import requires the service role';
  end if;

  if jsonb_typeof(payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'protected content payload must be an object';
  end if;

  v_version_key := btrim(payload->>'version');
  v_items := payload->'items';
  if char_length(v_version_key) < 3 or jsonb_typeof(v_items) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'protected content version and items are required';
  end if;

  v_item_count := jsonb_array_length(v_items);
  select count(distinct item->>'conceptId')
  into v_concept_count
  from jsonb_array_elements(v_items) as item;

  if v_item_count <> 24 or v_concept_count <> 8 then
    raise exception using
      errcode = '23514',
      message = 'protected content requires 24 items and eight concepts';
  end if;

  if exists (
    select 1
    from (
      select
        item->>'conceptId' as concept_id,
        count(*) as item_count
      from jsonb_array_elements(v_items) as item
      group by item->>'conceptId'
    ) as coverage
    where concept_id !~ '^C[1-8]$'
      or item_count <> 3
  ) then
    raise exception using
      errcode = '23514',
      message = 'each concept requires exactly three items';
  end if;

  if (
    select count(distinct item->>'id')
    from jsonb_array_elements(v_items) as item
  ) <> 24 then
    raise exception using
      errcode = '23505',
      message = 'protected item IDs must be unique';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) as item
    where item->>'id' !~ '^C[1-8]-Q[1-3]$'
      or split_part(item->>'id', '-', 1) <> item->>'conceptId'
      or item->>'form' not in ('diagnostic', 'practice', 'final')
      or char_length(btrim(item->>'stem')) < 20
      or char_length(btrim(item->>'rationale')) < 20
      or jsonb_typeof(item->'interaction') <> 'object'
      or jsonb_typeof(item->'misconceptionTags') <> 'array'
      or jsonb_array_length(item->'misconceptionTags') < 1
      or jsonb_typeof(item->'sourceRefs') <> 'array'
      or jsonb_array_length(item->'sourceRefs') < 1
  ) then
    raise exception using
      errcode = '23514',
      message = 'one or more protected items are malformed';
  end if;

  v_payload_digest := extensions.digest(payload::text, 'sha256');
  select id, payload_digest
  into v_version_id, v_existing_digest
  from content.content_versions
  where version_key = v_version_key;

  if found then
    if v_existing_digest <> v_payload_digest then
      raise exception using
        errcode = '23505',
        message = 'an immutable content version cannot be replaced';
    end if;
    return jsonb_build_object(
      'version', v_version_key,
      'itemCount', 24,
      'conceptCount', 8
    );
  end if;

  insert into content.content_versions (
    version_key,
    payload_digest,
    item_count,
    concept_count
  )
  values (v_version_key, v_payload_digest, 24, 8)
  returning id into v_version_id;

  insert into content.concepts (version_id, concept_id)
  select distinct v_version_id, item->>'conceptId'
  from jsonb_array_elements(v_items) as item;

  for v_item in
    select value from jsonb_array_elements(v_items)
  loop
    v_interaction := v_item->'interaction';
    v_interaction_kind := v_interaction->>'kind';
    if v_interaction_kind not in (
      'single-choice',
      'multi-select',
      'scenario-sort',
      'classification'
    ) then
      raise exception using
        errcode = '23514',
        message = 'unsupported protected interaction kind';
    end if;

    insert into content.learning_items (
      version_id,
      item_key,
      concept_id,
      form,
      stem,
      interaction_kind,
      interaction_payload,
      correct_response,
      rationale,
      misconception_tags
    )
    values (
      v_version_id,
      v_item->>'id',
      v_item->>'conceptId',
      v_item->>'form',
      v_item->>'stem',
      v_interaction_kind,
      v_interaction,
      case v_interaction_kind
        when 'scenario-sort' then v_interaction->'correctOrderIds'
        when 'classification' then v_interaction->'correctCategoryByPrompt'
        else v_interaction->'correctOptionIds'
      end,
      v_item->>'rationale',
      array(
        select jsonb_array_elements_text(v_item->'misconceptionTags')
      )
    )
    returning id into v_item_uuid;

    v_option_order := 0;
    if v_interaction_kind = 'classification' then
      for v_option in
        select value from jsonb_array_elements(v_interaction->'prompts')
      loop
        v_option_order := v_option_order + 1;
        insert into content.item_options (
          item_id,
          option_id,
          option_text,
          option_kind,
          option_order,
          correct_category
        )
        values (
          v_item_uuid,
          v_option->>'id',
          v_option->>'text',
          'classification-prompt',
          v_option_order,
          v_interaction->'correctCategoryByPrompt'->>(v_option->>'id')
        );
      end loop;
    else
      for v_option in
        select value from jsonb_array_elements(v_interaction->'options')
      loop
        v_option_order := v_option_order + 1;
        insert into content.item_options (
          item_id,
          option_id,
          option_text,
          option_kind,
          option_order
        )
        values (
          v_item_uuid,
          v_option->>'id',
          v_option->>'text',
          'option',
          v_option_order
        );
      end loop;
    end if;

    for v_source_ref in
      select value from jsonb_array_elements(v_item->'sourceRefs')
    loop
      insert into content.item_source_refs (
        item_id,
        source_document,
        page_start,
        page_end
      )
      values (
        v_item_uuid,
        v_source_ref->>'document',
        (v_source_ref->>'pageStart')::smallint,
        case
          when v_source_ref ? 'pageEnd'
            then (v_source_ref->>'pageEnd')::smallint
          else null
        end
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'version', v_version_key,
    'itemCount', v_item_count,
    'conceptCount', v_concept_count
  );
end;
$$;

comment on schema content is
  'Private protected learning content; never expose through browser grants.';
comment on table content.learning_items is
  'Protected stems, interaction payloads, answers, rationales, and misconceptions.';
comment on function public.import_learning_content(jsonb) is
  'Service-role-only atomic import for one immutable reviewed content version.';

revoke all on function public.import_learning_content(jsonb) from public;
grant execute on function public.import_learning_content(jsonb) to service_role;
