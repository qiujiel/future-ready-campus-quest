import { describe, expect, it, vi } from "vitest";
import {
  RETENTION_QUERY,
  CLASSROOM_VERIFICATION_QUERY,
  assertBootstrapConfiguration,
  bootstrapProductionClassroom,
  bootstrapConfigurationFromEnvironment,
  createProductionBootstrapDependencies,
  type BootstrapCohort,
  type BootstrapConfiguration,
  type BootstrapDependencies,
} from "../../scripts/production-classroom-bootstrap";

const TEACHER_ID = "11111111-1111-4111-8111-111111111111";
const COHORT_ID = "22222222-2222-4222-8222-222222222222";

const validConfiguration: BootstrapConfiguration = {
  supabaseUrl: "https://ghohuwwjxgjqnbsauvzq.supabase.co",
  productionProjectRef: "ghohuwwjxgjqnbsauvzq",
  loadProjectRef: "vadyhuipwbtgbzpeisbn",
  secretKey: "synthetic-modern-secret",
  accessToken: "synthetic-management-token",
  teacherEmail: "teacher@example.test",
  teacherPassword: "Example@2026",
  retentionDays: 90,
  authorizationId: "course-owner-2026-08-08",
};

describe("production classroom bootstrap configuration", () => {
  it("accepts only the exact approved production configuration", () => {
    expect(() => assertBootstrapConfiguration(validConfiguration)).not.toThrow();
  });

  it("rejects the load-test project as the production target", () => {
    expect(() => assertBootstrapConfiguration({
      ...validConfiguration,
      productionProjectRef: "vadyhuipwbtgbzpeisbn",
    })).toThrow(/production identity/i);
  });

  it("rejects a retention period outside the course-owner approval", () => {
    expect(() => assertBootstrapConfiguration({
      ...validConfiguration,
      retentionDays: 89,
    })).toThrow(/retention authorization/i);
  });

  it("rejects a weak temporary teacher credential", () => {
    expect(() => assertBootstrapConfiguration({
      ...validConfiguration,
      teacherPassword: "short",
    })).toThrow(/teacher credential policy/i);
  });

  it("uses only parameter placeholders in the fixed retention query", () => {
    expect(RETENTION_QUERY).toContain("private.data_retention_configuration");
    expect(RETENTION_QUERY).toContain("$1");
    expect(RETENTION_QUERY).toContain("$2");
    expect(RETENTION_QUERY).not.toMatch(/90|course-owner/);
  });
});

const closedSmokeCohort: BootstrapCohort = {
  id: COHORT_ID,
  teacherId: TEACHER_ID,
  title: "Production Classroom",
  groupCount: 5,
  groupCapacity: 6,
  archivedAt: null,
};

function dependencies(
  overrides: Partial<BootstrapDependencies> = {},
): BootstrapDependencies {
  return {
    updateRetention: async () => 90,
    findTeacherByEmail: async () => null,
    createTeacher: async () => ({
      id: TEACHER_ID,
      bootstrapAuthorizationId: validConfiguration.authorizationId,
    }),
    ensureTeacherRole: async () => undefined,
    findSmokeCohort: async () => null,
    createSmokeCohort: async () => closedSmokeCohort,
    verifyClosedClassroom: async () => undefined,
    ...overrides,
  };
}

describe("production classroom bootstrap orchestration", () => {
  it("creates the marked teacher and closed smoke cohort once", async () => {
    const calls: string[] = [];
    const receipt = await bootstrapProductionClassroom(
      validConfiguration,
      dependencies({
        updateRetention: async () => {
          calls.push("retention");
          return 90;
        },
        createTeacher: async () => {
          calls.push("create-teacher");
          return {
            id: TEACHER_ID,
            bootstrapAuthorizationId: validConfiguration.authorizationId,
          };
        },
        ensureTeacherRole: async () => {
          calls.push("teacher-role");
        },
        createSmokeCohort: async () => {
          calls.push("create-cohort");
          return closedSmokeCohort;
        },
        verifyClosedClassroom: async () => {
          calls.push("verify-closed");
        },
      }),
    );

    expect(calls).toEqual([
      "retention",
      "create-teacher",
      "teacher-role",
      "create-cohort",
      "verify-closed",
    ]);
    expect(receipt).toEqual({
      teacherId: TEACHER_ID,
      cohortId: COHORT_ID,
      retentionDays: 90,
      groupCount: 5,
      groupCapacity: 6,
    });
  });

  it("resumes a retry only for the same bootstrap marker", async () => {
    let teacherCreates = 0;
    let cohortCreates = 0;
    const receipt = await bootstrapProductionClassroom(
      validConfiguration,
      dependencies({
        findTeacherByEmail: async () => ({
          id: TEACHER_ID,
          bootstrapAuthorizationId: validConfiguration.authorizationId,
        }),
        createTeacher: async () => {
          teacherCreates += 1;
          throw new Error("must not create");
        },
        findSmokeCohort: async () => closedSmokeCohort,
        createSmokeCohort: async () => {
          cohortCreates += 1;
          throw new Error("must not create");
        },
      }),
    );

    expect(teacherCreates).toBe(0);
    expect(cohortCreates).toBe(0);
    expect(receipt.teacherId).toBe(TEACHER_ID);
    expect(receipt.cohortId).toBe(COHORT_ID);
  });

  it("refuses to modify an unrelated existing account", async () => {
    let roleWrites = 0;
    await expect(bootstrapProductionClassroom(
      validConfiguration,
      dependencies({
        findTeacherByEmail: async () => ({ id: TEACHER_ID }),
        ensureTeacherRole: async () => {
          roleWrites += 1;
        },
      }),
    )).rejects.toThrow("BOOTSTRAP_ACCOUNT_CONFLICT");
    expect(roleWrites).toBe(0);
  });

  it("rejects an archived or incorrectly sized smoke cohort", async () => {
    await expect(bootstrapProductionClassroom(
      validConfiguration,
      dependencies({
        findSmokeCohort: async () => ({
          ...closedSmokeCohort,
          archivedAt: "2026-08-08T00:00:00Z",
          groupCount: 4,
        }),
      }),
    )).rejects.toThrow("BOOTSTRAP_COHORT_INVALID");
  });

  it("stops before account creation when retention fails", async () => {
    let accountReads = 0;
    await expect(bootstrapProductionClassroom(
      validConfiguration,
      dependencies({
        updateRetention: async () => {
          throw new Error("management response included private detail");
        },
        findTeacherByEmail: async () => {
          accountReads += 1;
          return null;
        },
      }),
    )).rejects.toThrow("BOOTSTRAP_RETENTION_FAILED");
    expect(accountReads).toBe(0);
  });

  it("never includes credential values in dependency failures", async () => {
    const privateValues = [
      validConfiguration.teacherEmail,
      validConfiguration.teacherPassword,
      validConfiguration.accessToken,
      validConfiguration.secretKey,
    ];
    const error = await bootstrapProductionClassroom(
      validConfiguration,
      dependencies({
        createTeacher: async () => {
          throw new Error(privateValues.join(" "));
        },
      }),
    ).catch((reason: unknown) => String(reason));

    expect(error).toContain("BOOTSTRAP_ACCOUNT_FAILED");
    for (const value of privateValues) expect(error).not.toContain(value);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("production classroom bootstrap adapters", () => {
  it("uses an isolated Auth client storage namespace", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      createProductionBootstrapDependencies(validConfiguration, async () =>
        jsonResponse([]));
      createProductionBootstrapDependencies(validConfiguration, async () =>
        jsonResponse([]));
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it("sends only the fixed parameterized retention query", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const recordingFetch: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), ...(init ? { init } : {}) });
      return jsonResponse([{ retentionDays: 90 }], 201);
    };
    const adapters = createProductionBootstrapDependencies(
      validConfiguration,
      recordingFetch,
    );

    await expect(adapters.updateRetention(90, "course-owner"))
      .resolves.toBe(90);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://api.supabase.com/v1/projects/ghohuwwjxgjqnbsauvzq/database/query",
    );
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer synthetic-management-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      query: RETENTION_QUERY,
      parameters: [90, "course-owner"],
      read_only: false,
    });
  });

  it("redacts a failed Management API response", async () => {
    const privateBody = `${validConfiguration.teacherEmail} ${validConfiguration.accessToken}`;
    const adapters = createProductionBootstrapDependencies(
      validConfiguration,
      async () => jsonResponse({ message: privateBody }, 500),
    );

    const error = await adapters.updateRetention(90, "course-owner")
      .catch((reason: unknown) => String(reason));
    expect(error).toContain("BOOTSTRAP_RETENTION_FAILED");
    expect(error).not.toContain(validConfiguration.teacherEmail);
    expect(error).not.toContain(validConfiguration.accessToken);
  });

  it("creates an email-confirmed teacher with the exact bootstrap marker", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const recordingFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, ...(init ? { init } : {}) });
      if (url.includes("api.supabase.com")) {
        return jsonResponse([{ retentionDays: 90 }], 201);
      }
      return jsonResponse({
        id: TEACHER_ID,
        email: validConfiguration.teacherEmail,
        app_metadata: {
          role: "teacher",
          bootstrapAuthorizationId: validConfiguration.authorizationId,
        },
      });
    };
    const adapters = createProductionBootstrapDependencies(
      validConfiguration,
      recordingFetch,
    );

    await expect(adapters.createTeacher({
      email: validConfiguration.teacherEmail,
      password: validConfiguration.teacherPassword,
      authorizationId: validConfiguration.authorizationId,
    })).resolves.toEqual({
      id: TEACHER_ID,
      bootstrapAuthorizationId: validConfiguration.authorizationId,
    });
    const authRequest = requests.find(({ url }) =>
      url.endsWith("/auth/v1/admin/users")
    );
    expect(authRequest?.init?.method).toBe("POST");
    expect(JSON.parse(String(authRequest?.init?.body))).toEqual({
      email: validConfiguration.teacherEmail,
      password: validConfiguration.teacherPassword,
      email_confirm: true,
      app_metadata: {
        role: "teacher",
        bootstrapAuthorizationId: validConfiguration.authorizationId,
      },
    });
  });

  it("confirms an existing teacher role without an update-style write", async () => {
    const methods: string[] = [];
    const recordingFetch: typeof fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      methods.push(method);
      const url = String(input);
      if (url.includes("/rest/v1/user_roles") && method === "GET") {
        return jsonResponse([{ role: "teacher" }]);
      }
      return jsonResponse([]);
    };
    const adapters = createProductionBootstrapDependencies(
      validConfiguration,
      recordingFetch,
    );

    await expect(adapters.ensureTeacherRole(TEACHER_ID)).resolves.toBeUndefined();
    expect(methods).toEqual(["GET"]);
  });

  it("rejects a classroom with an active join window", async () => {
    const recordingFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.supabase.com")) {
        return jsonResponse([{
          cohortValid: true,
          groupCount: 5,
          openJoinWindows: 1,
          allowedQuestStarts: 0,
        }], 201);
      }
      return jsonResponse([]);
    };
    const adapters = createProductionBootstrapDependencies(
      validConfiguration,
      recordingFetch,
    );

    await expect(adapters.verifyClosedClassroom(TEACHER_ID, COHORT_ID))
      .rejects.toThrow("BOOTSTRAP_VERIFICATION_FAILED");
  });

  it("verifies the closed classroom through one fixed aggregate query", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const recordingFetch: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), ...(init ? { init } : {}) });
      return jsonResponse([{
        cohortValid: true,
        groupCount: 5,
        openJoinWindows: 0,
        allowedQuestStarts: 0,
      }], 201);
    };
    const adapters = createProductionBootstrapDependencies(
      validConfiguration,
      recordingFetch,
    );

    await expect(adapters.verifyClosedClassroom(TEACHER_ID, COHORT_ID))
      .resolves.toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      query: CLASSROOM_VERIFICATION_QUERY,
      parameters: [COHORT_ID, TEACHER_ID],
      read_only: true,
    });
  });

  it("maps only named protected environment values into configuration", () => {
    const environment = {
      PRODUCTION_SUPABASE_URL: validConfiguration.supabaseUrl,
      PRODUCTION_SUPABASE_PROJECT_REF: validConfiguration.productionProjectRef,
      LOAD_SUPABASE_PROJECT_REF: validConfiguration.loadProjectRef,
      PRODUCTION_SUPABASE_SECRET_KEY: validConfiguration.secretKey,
      SUPABASE_ACCESS_TOKEN: validConfiguration.accessToken,
      PRODUCTION_TEACHER_EMAIL: validConfiguration.teacherEmail,
      PRODUCTION_TEACHER_PASSWORD: validConfiguration.teacherPassword,
      PRODUCTION_RETENTION_DAYS: "90",
      BOOTSTRAP_AUTHORIZATION_ID: validConfiguration.authorizationId,
      SUPABASE_SERVICE_ROLE_KEY: "forbidden-legacy-value",
    };

    expect(bootstrapConfigurationFromEnvironment(environment))
      .toEqual(validConfiguration);
  });
});
