import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const MIGRATIONS = [
  {
    version: "20260808000100",
    name: "classroom_nat_join_capacity",
    file: "20260808000100_classroom_nat_join_capacity.sql",
  },
  {
    version: "20260808000200",
    name: "concurrent_join_locking",
    file: "20260808000200_concurrent_join_locking.sql",
  },
  {
    version: "20260808000300",
    name: "combined_join_preparation",
    file: "20260808000300_combined_join_preparation.sql",
  },
];

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
  const appliedVersions = [];
  for (const candidate of MIGRATIONS) {
    const existing = await query(configuration, `
      select exists (
        select 1 from supabase_migrations.schema_migrations
        where version = '${candidate.version}'
      ) as "alreadyApplied";
    `, true);
    const alreadyApplied = Array.isArray(existing) &&
      existing[0]?.alreadyApplied === true;
    if (alreadyApplied) continue;

    const migration = await readFile(
      resolve(baseDirectory, "supabase/migrations", candidate.file),
      "utf8",
    );
    await query(configuration, `
        begin;
        ${migration}
        insert into supabase_migrations.schema_migrations (version, name)
        values ('${candidate.version}', '${candidate.name}');
        commit;
      `);
    appliedVersions.push(candidate.version);
  }

  const verification = await query(configuration, `
    select
      3 = (
        select count(*)
        from supabase_migrations.schema_migrations
        where version in (
          '20260808000100',
          '20260808000200',
          '20260808000300'
        )
      ) as "migrationsRecorded",
      position(
        'count(*) >= 45' in pg_get_functiondef(
          'public.preflight_student_join(text,smallint,text)'::regprocedure
        )
      ) > 0 as "sharedNetworkLimitReady",
      position(
        'count(*) >= 90' in pg_get_functiondef(
          'public.preflight_student_join(text,smallint,text)'::regprocedure
        )
      ) > 0 as "windowLimitReady",
      position(
        'pg_advisory_xact_lock' in pg_get_functiondef(
          'public.preflight_student_join(text,smallint,text)'::regprocedure
        )
      ) > 0 as "atomicRateLockReady",
      position(
        'for share of codes, windows' in pg_get_functiondef(
          'public.complete_student_code_join(text,uuid,uuid,text)'::regprocedure
        )
      ) > 0 as "sharedWindowLockReady",
      position(
        'for update of groups' in pg_get_functiondef(
          'public.complete_student_code_join(text,uuid,uuid,text)'::regprocedure
        )
      ) > 0 as "groupCapacityLockReady",
      position(
        'find_completed_student_code_join' in pg_get_functiondef(
          'public.prepare_student_code_join(text,uuid,text)'::regprocedure
        )
      ) > 0
      and position(
        'preflight_student_code_join' in pg_get_functiondef(
          'public.prepare_student_code_join(text,uuid,text)'::regprocedure
        )
      ) > 0 as "combinedPreparationReady";
  `, true);
  const row = Array.isArray(verification) ? verification[0] : null;
  if (
    row?.migrationsRecorded !== true ||
    row?.sharedNetworkLimitReady !== true ||
    row?.windowLimitReady !== true ||
    row?.atomicRateLockReady !== true ||
    row?.sharedWindowLockReady !== true ||
    row?.groupCapacityLockReady !== true ||
    row?.combinedPreparationReady !== true
  ) {
    throw new Error("NAT_FIX_VERIFICATION_FAILED");
  }
  return {
    appliedVersions,
    migrationVersions: MIGRATIONS.map((migration) => migration.version),
    sharedNetworkLimit: 45,
    windowLimit: 90,
    concurrentWindowLocking: true,
    combinedJoinPreparation: true,
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
