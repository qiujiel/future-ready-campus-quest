const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

const DATABASE_QUERY = `select
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations') as migration_table_count,
  (select count(*)::int from auth.users) as auth_user_count,
  (select count(*)::int from storage.buckets) as storage_bucket_count,
  (select count(*)::int from storage.objects) as storage_object_count,
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm', 'f')) as app_relation_count,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')) as app_function_count`;

const DATABASE_FIELDS = [
  "migrationTableCount",
  "authUserCount",
  "storageBucketCount",
  "storageObjectCount",
  "appRelationCount",
  "appFunctionCount",
];

function configurationFailure(message) {
  throw new Error(`Bootstrap configuration invalid: ${message}`);
}

function preflightFailure(message) {
  throw new Error(`Production bootstrap preflight failed: ${message}`);
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    configurationFailure(`${name} is required`);
  }
  return value;
}

export function readBootstrapConfiguration(environment) {
  const configuration = {
    releaseMode: requiredString(environment.RELEASE_MODE, "RELEASE_MODE"),
    bootstrapAuthorizationId: requiredString(
      environment.BOOTSTRAP_AUTHORIZATION_ID,
      "BOOTSTRAP_AUTHORIZATION_ID",
    ),
    projectRef: requiredString(
      environment.PRODUCTION_SUPABASE_PROJECT_REF,
      "PRODUCTION_SUPABASE_PROJECT_REF",
    ),
    loadProjectRef: requiredString(
      environment.LOAD_SUPABASE_PROJECT_REF,
      "LOAD_SUPABASE_PROJECT_REF",
    ),
    url: requiredString(environment.PRODUCTION_SUPABASE_URL, "PRODUCTION_SUPABASE_URL"),
    accessToken: requiredString(environment.SUPABASE_ACCESS_TOKEN, "SUPABASE_ACCESS_TOKEN"),
    serviceRoleKey: requiredString(
      environment.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY,
      "PRODUCTION_SUPABASE_SERVICE_ROLE_KEY",
    ),
  };

  if (configuration.releaseMode !== "bootstrap") {
    configurationFailure("RELEASE_MODE must equal bootstrap");
  }
  if (configuration.projectRef !== PRODUCTION_PROJECT_REF) {
    configurationFailure("production project identity");
  }
  if (configuration.loadProjectRef !== LOAD_PROJECT_REF) {
    configurationFailure("load project identity");
  }
  if (configuration.projectRef === configuration.loadProjectRef) {
    configurationFailure("production and load projects must differ");
  }
  if (configuration.url !== PRODUCTION_URL) {
    configurationFailure("production URL identity");
  }

  return Object.freeze(configuration);
}

function aggregate(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    preflightFailure(`${name} aggregate is invalid`);
  }
  return value;
}

export function evaluateBootstrapSnapshot(snapshot, configuration) {
  if (
    configuration?.releaseMode !== "bootstrap" ||
    configuration?.projectRef !== PRODUCTION_PROJECT_REF ||
    configuration?.loadProjectRef !== LOAD_PROJECT_REF ||
    configuration?.projectRef === configuration?.loadProjectRef ||
    configuration?.url !== PRODUCTION_URL
  ) {
    preflightFailure("project identity mismatch");
  }
  if (!snapshot?.database || typeof snapshot.database !== "object") {
    preflightFailure("database aggregate response invalid");
  }

  const counts = Object.fromEntries([
    ...DATABASE_FIELDS.map((name) => [name, aggregate(snapshot.database[name], name)]),
    ["authAdminUserCount", aggregate(snapshot.authAdminUserCount, "authAdminUserCount")],
    [
      "storageAdminBucketCount",
      aggregate(snapshot.storageAdminBucketCount, "storageAdminBucketCount"),
    ],
    ["edgeFunctionCount", aggregate(snapshot.edgeFunctionCount, "edgeFunctionCount")],
  ]);

  if (
    counts.authUserCount !== counts.authAdminUserCount ||
    counts.storageBucketCount !== counts.storageAdminBucketCount
  ) {
    preflightFailure("Auth or Storage cross-check mismatch");
  }

  for (const [name, value] of Object.entries(counts)) {
    if (value !== 0) preflightFailure(`production is not empty: ${name}`);
  }

  return Object.freeze({
    projectRef: configuration.projectRef,
    releaseMode: configuration.releaseMode,
    bootstrapAuthorizationId: configuration.bootstrapAuthorizationId,
    migrationTableCount: counts.migrationTableCount,
    authUserCount: counts.authUserCount,
    storageBucketCount: counts.storageBucketCount,
    storageObjectCount: counts.storageObjectCount,
    appRelationCount: counts.appRelationCount,
    appFunctionCount: counts.appFunctionCount,
    edgeFunctionCount: counts.edgeFunctionCount,
  });
}

async function requestJson(label, url, options, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch {
    preflightFailure(`${label} request failed: network`);
  }
  if (!response?.ok) {
    preflightFailure(`${label} request failed: ${response?.status ?? "unknown"}`);
  }
  try {
    return await response.json();
  } catch {
    preflightFailure(`${label} response invalid`);
  }
}

function databaseSnapshot(body) {
  if (
    !Array.isArray(body) ||
    body.length !== 1 ||
    !body[0] ||
    typeof body[0] !== "object" ||
    Array.isArray(body[0])
  ) {
    preflightFailure("database aggregate response invalid");
  }
  const row = body[0];
  const database = {
    migrationTableCount: row.migration_table_count,
    authUserCount: row.auth_user_count,
    storageBucketCount: row.storage_bucket_count,
    storageObjectCount: row.storage_object_count,
    appRelationCount: row.app_relation_count,
    appFunctionCount: row.app_function_count,
  };
  for (const [name, value] of Object.entries(database)) aggregate(value, name);
  return database;
}

export async function fetchBootstrapSnapshot(
  configuration,
  fetchImpl = globalThis.fetch,
) {
  if (typeof fetchImpl !== "function") preflightFailure("fetch implementation unavailable");
  const managementHeaders = {
    authorization: `Bearer ${configuration.accessToken}`,
    "content-type": "application/json",
  };
  const serviceHeaders = {
    apikey: configuration.serviceRoleKey,
    authorization: `Bearer ${configuration.serviceRoleKey}`,
  };
  const managementBase =
    `https://api.supabase.com/v1/projects/${configuration.projectRef}`;

  const databaseBody = await requestJson(
    "database aggregate",
    `${managementBase}/database/query`,
    {
      method: "POST",
      headers: managementHeaders,
      body: JSON.stringify({ query: DATABASE_QUERY, read_only: true }),
    },
    fetchImpl,
  );
  const functionsBody = await requestJson(
    "Edge Function",
    `${managementBase}/functions`,
    { headers: { authorization: `Bearer ${configuration.accessToken}` } },
    fetchImpl,
  );
  const authBody = await requestJson(
    "Auth",
    `${configuration.url}/auth/v1/admin/users?page=1&per_page=1`,
    { headers: serviceHeaders },
    fetchImpl,
  );
  const storageBody = await requestJson(
    "Storage",
    `${configuration.url}/storage/v1/bucket`,
    { headers: serviceHeaders },
    fetchImpl,
  );

  if (!Array.isArray(functionsBody)) {
    preflightFailure("Edge Function response invalid");
  }
  if (
    !authBody ||
    typeof authBody !== "object" ||
    Array.isArray(authBody) ||
    !Array.isArray(authBody.users) ||
    authBody.users.length !== 0 ||
    authBody.total !== 0 ||
    (authBody.next_page !== null && authBody.next_page !== undefined)
  ) {
    preflightFailure("Auth response invalid");
  }
  if (!Array.isArray(storageBody)) {
    preflightFailure("Storage response invalid");
  }

  return Object.freeze({
    database: databaseSnapshot(databaseBody),
    authAdminUserCount: authBody.total,
    storageAdminBucketCount: storageBody.length,
    edgeFunctionCount: functionsBody.length,
  });
}
