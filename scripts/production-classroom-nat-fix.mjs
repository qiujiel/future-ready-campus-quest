import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const MIGRATION_VERSION = "20260808000100";
const MIGRATION_NAME = "classroom_nat_join_capacity";

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function readProductionNatFixConfiguration(environment) {
  const projectRef = required(
    environment,
    "PRODUCTION_SUPABASE_PROJECT_REF",
  );
  const loadProjectRef = required(environment, "LOAD_SUPABASE_PROJECT_REF");
  if (
    projectRef !== PRODUCTION_PROJECT_REF ||
    loadProjectRef !== LOAD_PROJECT_REF ||
    projectRef === loadProjectRef
  ) {
    throw new Error("Forward fix target must be the exact production project.");
  }
  return {
    projectRef,
    loadProjectRef,
    accessToken: required(environment, "SUPABASE_ACCESS_TOKEN"),
  };
}

async function query(configuration, sql, readOnly = false) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${configuration.projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql, read_only: readOnly }),
    },
  );
  if (response.status !== 201) throw new Error("NAT_FIX_QUERY_FAILED");
  return response.json();
}

export async function applyProductionNatFix(configuration, baseDirectory) {
  const existing = await query(configuration, `
    select exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '${MIGRATION_VERSION}'
    ) as "alreadyApplied";
  `, true);
  const alreadyApplied = Array.isArray(existing) &&
    existing[0]?.alreadyApplied === true;

  if (!alreadyApplied) {
    const migration = await readFile(resolve(
      baseDirectory,
      "supabase/migrations/20260808000100_classroom_nat_join_capacity.sql",
    ), "utf8");
    await query(configuration, `
      begin;
      ${migration}
      insert into supabase_migrations.schema_migrations (version, name)
      values ('${MIGRATION_VERSION}', '${MIGRATION_NAME}');
      commit;
    `);
  }

  const verification = await query(configuration, `
    select
      exists (
        select 1 from supabase_migrations.schema_migrations
        where version = '${MIGRATION_VERSION}'
      ) as "migrationRecorded",
      position(
        'count(*) >= 45' in pg_get_functiondef(
          'public.preflight_student_join(text,smallint,text)'::regprocedure
        )
      ) > 0 as "sharedNetworkLimitReady",
      position(
        'count(*) >= 90' in pg_get_functiondef(
          'public.preflight_student_join(text,smallint,text)'::regprocedure
        )
      ) > 0 as "windowLimitReady";
  `, true);
  const row = Array.isArray(verification) ? verification[0] : null;
  if (
    row?.migrationRecorded !== true ||
    row?.sharedNetworkLimitReady !== true ||
    row?.windowLimitReady !== true
  ) {
    throw new Error("NAT_FIX_VERIFICATION_FAILED");
  }
  return {
    applied: !alreadyApplied,
    migrationVersion: MIGRATION_VERSION,
    sharedNetworkLimit: 45,
    windowLimit: 90,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const receipt = await applyProductionNatFix(
    readProductionNatFixConfiguration(process.env),
    process.cwd(),
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
