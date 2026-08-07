import { describe, expect, it } from "vitest";

import {
  evaluateBootstrapSnapshot,
  fetchBootstrapSnapshot,
  readBootstrapConfiguration,
} from "../../scripts/production-bootstrap-preflight-core.mjs";

const productionRef = "ghohuwwjxgjqnbsauvzq";
const loadRef = "vadyhuipwbtgbzpeisbn";
const productionUrl = `https://${productionRef}.supabase.co`;
const bootstrapAuthorizationId =
  "frcq-bootstrap-20260807T120000Z-a1b2c3d4";

const environment = {
  RELEASE_MODE: "bootstrap",
  BOOTSTRAP_AUTHORIZATION_ID: bootstrapAuthorizationId,
  PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
  LOAD_SUPABASE_PROJECT_REF: loadRef,
  PRODUCTION_SUPABASE_URL: productionUrl,
  SUPABASE_ACCESS_TOKEN: "management-token-value",
  PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: "service-role-value",
};

const configuration = {
  releaseMode: "bootstrap",
  bootstrapAuthorizationId,
  projectRef: productionRef,
  loadProjectRef: loadRef,
  url: productionUrl,
  accessToken: environment.SUPABASE_ACCESS_TOKEN,
  serviceRoleKey: environment.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY,
};

const empty = {
  database: {
    migrationTableCount: 0,
    authUserCount: 0,
    storageBucketCount: 0,
    storageObjectCount: 0,
    appRelationCount: 0,
    appFunctionCount: 0,
  },
  authAdminUserCount: 0,
  storageAdminBucketCount: 0,
  edgeFunctionCount: 0,
};

const expectedEvidence = {
  projectRef: productionRef,
  releaseMode: "bootstrap",
  bootstrapAuthorizationId,
  migrationTableCount: 0,
  authUserCount: 0,
  storageBucketCount: 0,
  storageObjectCount: 0,
  appRelationCount: 0,
  appFunctionCount: 0,
  edgeFunctionCount: 0,
};

function response(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function successfulFetch(requests) {
  return async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/database/query")) {
      return response([{
        migration_table_count: 0,
        auth_user_count: 0,
        storage_bucket_count: 0,
        storage_object_count: 0,
        app_relation_count: 0,
        app_function_count: 0,
      }]);
    }
    if (String(url).endsWith("/functions")) return response([]);
    if (String(url).includes("/auth/v1/admin/users")) {
      return response({
        aud: "authenticated",
        users: [],
        next_page: null,
        last_page: 0,
        total: 0,
      });
    }
    if (String(url).endsWith("/storage/v1/bucket")) return response([]);
    return response({ message: "unexpected request" }, { status: 404 });
  };
}

describe("production bootstrap preflight", () => {
  it("reads only the exact production bootstrap configuration", () => {
    expect(readBootstrapConfiguration(environment)).toEqual(configuration);
  });

  it.each([
    ["RELEASE_MODE", "upgrade"],
    ["PRODUCTION_SUPABASE_PROJECT_REF", loadRef],
    ["LOAD_SUPABASE_PROJECT_REF", productionRef],
    ["PRODUCTION_SUPABASE_URL", `https://${loadRef}.supabase.co`],
    ["SUPABASE_ACCESS_TOKEN", ""],
    ["PRODUCTION_SUPABASE_SERVICE_ROLE_KEY", ""],
  ])("rejects unsafe configuration field %s", (name, value) => {
    expect(() => readBootstrapConfiguration({
      ...environment,
      [name]: value,
    })).toThrow(/bootstrap configuration invalid/i);
  });

  it("accepts only the exact empty production project", () => {
    expect(evaluateBootstrapSnapshot(empty, configuration))
      .toEqual(expectedEvidence);
  });

  it.each([
    ["migrationTableCount", 1],
    ["authUserCount", 1],
    ["storageBucketCount", 1],
    ["storageObjectCount", 1],
    ["appRelationCount", 1],
    ["appFunctionCount", 1],
  ])("rejects nonempty database surface %s", (name, value) => {
    const snapshot = {
      ...empty,
      database: { ...empty.database, [name]: value },
    };
    if (name === "authUserCount") snapshot.authAdminUserCount = value;
    if (name === "storageBucketCount") snapshot.storageAdminBucketCount = value;
    expect(() => evaluateBootstrapSnapshot(snapshot, configuration))
      .toThrow(/not empty/i);
  });

  it.each([-1, 0.5, "0", null, undefined])(
    "rejects invalid aggregate count %j",
    (authUserCount) => {
      expect(() => evaluateBootstrapSnapshot({
        ...empty,
        database: { ...empty.database, authUserCount },
      }, configuration)).toThrow(/aggregate/i);
    },
  );

  it("rejects a deployed Edge Function", () => {
    expect(() => evaluateBootstrapSnapshot({
      ...empty,
      edgeFunctionCount: 1,
    }, configuration)).toThrow(/not empty/i);
  });

  it("rejects disagreeing Auth and Storage cross-check counts", () => {
    expect(() => evaluateBootstrapSnapshot({
      ...empty,
      authAdminUserCount: 1,
      storageAdminBucketCount: 1,
    }, configuration)).toThrow(/cross-check/i);
  });

  it("fetches every authoritative surface with server-only credentials", async () => {
    const requests = [];
    await expect(fetchBootstrapSnapshot(configuration, successfulFetch(requests)))
      .resolves.toEqual(empty);

    expect(requests.map(({ url }) => url)).toEqual([
      `https://api.supabase.com/v1/projects/${productionRef}/database/query`,
      `https://api.supabase.com/v1/projects/${productionRef}/functions`,
      `${productionUrl}/auth/v1/admin/users?page=1&per_page=1`,
      `${productionUrl}/storage/v1/bucket`,
    ]);
    expect(requests[0].options).toMatchObject({
      method: "POST",
      headers: {
        authorization: `Bearer ${configuration.accessToken}`,
        "content-type": "application/json",
      },
    });
    expect(JSON.parse(requests[0].options.body)).toMatchObject({
      read_only: true,
    });
    expect(requests[2].options.headers).toEqual({
      apikey: configuration.serviceRoleKey,
      authorization: `Bearer ${configuration.serviceRoleKey}`,
    });
    expect(requests[3].options.headers).toEqual({
      apikey: configuration.serviceRoleKey,
      authorization: `Bearer ${configuration.serviceRoleKey}`,
    });
  });

  it("rejects non-success API responses without exposing bodies or credentials", async () => {
    const leak = "sensitive-provider-response";
    const fetchImpl = async () => response({ message: leak }, { status: 503 });
    let error;
    try {
      await fetchBootstrapSnapshot(configuration, fetchImpl);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/database aggregate request failed: 503/i);
    expect(error.message).not.toContain(leak);
    expect(error.message).not.toContain(configuration.accessToken);
    expect(error.message).not.toContain(configuration.serviceRoleKey);
  });

  it("rejects malformed database, Function, Auth, and Storage responses", async () => {
    const malformedBodies = [
      { database: {}, functions: [], auth: { users: [], total: 0 }, storage: [] },
      { database: [empty.database], functions: {}, auth: { users: [], total: 0 }, storage: [] },
      { database: [empty.database], functions: [], auth: [], storage: [] },
      { database: [empty.database], functions: [], auth: { users: [], total: 0 }, storage: {} },
    ];

    for (const bodies of malformedBodies) {
      let requestIndex = 0;
      const ordered = [bodies.database, bodies.functions, bodies.auth, bodies.storage];
      await expect(fetchBootstrapSnapshot(
        configuration,
        async () => response(ordered[requestIndex++]),
      )).rejects.toThrow(/response invalid/i);
    }
  });

  it("rejects an Auth result that is not conclusively empty", async () => {
    let requestIndex = 0;
    const ordered = [
      [{
        migration_table_count: 0,
        auth_user_count: 0,
        storage_bucket_count: 0,
        storage_object_count: 0,
        app_relation_count: 0,
        app_function_count: 0,
      }],
      [],
      {
        aud: "authenticated",
        users: [],
        next_page: 2,
        last_page: 2,
        total: 1,
      },
      [],
    ];
    await expect(fetchBootstrapSnapshot(
      configuration,
      async () => response(ordered[requestIndex++]),
    )).rejects.toThrow(/auth response invalid/i);
  });

  it("keeps credentials out of aggregate evidence", () => {
    const serialized = JSON.stringify(evaluateBootstrapSnapshot(empty, configuration));
    expect(serialized).not.toContain(configuration.accessToken);
    expect(serialized).not.toContain(configuration.serviceRoleKey);
  });
});
