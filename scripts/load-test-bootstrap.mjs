import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function readLoadBootstrapConfiguration(environment) {
  const projectRef = required(environment, "LOAD_SUPABASE_PROJECT_REF");
  const productionRef = required(
    environment,
    "PRODUCTION_SUPABASE_PROJECT_REF",
  );
  if (
    projectRef !== LOAD_PROJECT_REF ||
    productionRef !== PRODUCTION_PROJECT_REF ||
    projectRef === productionRef
  ) {
    throw new Error("Bootstrap target must be the exact dedicated load-test project.");
  }
  return {
    projectRef,
    productionRef,
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
  if (response.status !== 201) {
    throw new Error("LOAD_BOOTSTRAP_QUERY_FAILED");
  }
  return response.json();
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function bootstrapLoadSchema(configuration, baseDirectory) {
  const migrationDirectory = resolve(baseDirectory, "supabase", "migrations");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  if (migrationFiles.length === 0) throw new Error("LOAD_MIGRATIONS_MISSING");

  await query(configuration, `
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);
  const appliedRows = await query(
    configuration,
    "select version from supabase_migrations.schema_migrations order by version",
    true,
  );
  const applied = new Set(
    (Array.isArray(appliedRows) ? appliedRows : []).map((row) => String(row.version)),
  );

  let appliedCount = 0;
  for (const filename of migrationFiles) {
    const [version, ...nameParts] = filename.replace(/\.sql$/, "").split("_");
    if (applied.has(version)) continue;
    const migration = await readFile(resolve(migrationDirectory, filename), "utf8");
    await query(configuration, `
      begin;
      ${migration}
      insert into supabase_migrations.schema_migrations (version, name)
      values (${sqlLiteral(version)}, ${sqlLiteral(nameParts.join("_"))});
      commit;
    `);
    appliedCount += 1;
  }

  const verification = await query(configuration, `
    select
      to_regclass('public.user_roles') is not null as "identityReady",
      to_regclass('content.content_versions') is not null as "contentReady",
      to_regclass('public.quest_attempts') is not null as "learningReady",
      (select count(*) from supabase_migrations.schema_migrations) as "migrationCount";
  `, true);
  const row = Array.isArray(verification) ? verification[0] : null;
  if (
    row?.identityReady !== true ||
    row?.contentReady !== true ||
    row?.learningReady !== true ||
    Number(row?.migrationCount) !== migrationFiles.length
  ) {
    throw new Error("LOAD_BOOTSTRAP_VERIFICATION_FAILED");
  }
  return { appliedCount, migrationCount: migrationFiles.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const receipt = await bootstrapLoadSchema(
    readLoadBootstrapConfiguration(process.env),
    process.cwd(),
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
