export interface BootstrapConfiguration {
  supabaseUrl: string;
  productionProjectRef: string;
  loadProjectRef: string;
  secretKey: string;
  accessToken: string;
  teacherEmail: string;
  teacherPassword: string;
  retentionDays: number;
  authorizationId: string;
}

export interface BootstrapReceipt {
  teacherId: string;
  cohortId: string;
  retentionDays: 90;
  groupCount: 5;
  groupCapacity: 6;
}

export interface BootstrapUser {
  id: string;
  bootstrapAuthorizationId?: string;
}

export interface BootstrapCohort {
  id: string;
  teacherId: string;
  title: string;
  groupCount: number;
  groupCapacity: number;
  archivedAt: string | null;
}

export interface BootstrapDependencies {
  updateRetention(days: 90, approver: "course-owner"): Promise<90>;
  findTeacherByEmail(email: string): Promise<BootstrapUser | null>;
  createTeacher(input: {
    email: string;
    password: string;
    authorizationId: string;
  }): Promise<BootstrapUser>;
  ensureTeacherRole(teacherId: string): Promise<void>;
  findSmokeCohort(teacherId: string): Promise<BootstrapCohort | null>;
  createSmokeCohort(teacherId: string): Promise<BootstrapCohort>;
  verifyClosedClassroom(teacherId: string, cohortId: string): Promise<void>;
}

const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const BOOTSTRAP_AUTHORIZATION_ID = "course-owner-2026-08-08";
let authClientSequence = 0;

export const RETENTION_QUERY = `
update private.data_retention_configuration
set cohort_retention_days = $1,
    approved_by = $2,
    approved_at = coalesce(approved_at, now()),
    updated_at = now()
where singleton = true
  and (
    cohort_retention_days is null
    or (cohort_retention_days = $1 and approved_by = $2)
  )
returning cohort_retention_days as "retentionDays";
`;

export const CLASSROOM_VERIFICATION_QUERY = `
select
  exists (
    select 1
    from public.cohorts
    where id = $1::uuid
      and teacher_id = $2::uuid
      and title = 'Production Classroom'
      and group_count = 5
      and group_capacity = 6
      and archived_at is null
  ) as "cohortValid",
  (select count(*)::integer
   from public.groups
   where cohort_id = $1::uuid) as "groupCount",
  (select count(*)::integer
   from public.cohort_join_windows
   where cohort_id = $1::uuid
     and closed_at is null) as "openJoinWindows",
  (select count(*)::integer
   from public.cohort_session_controls
   where cohort_id = $1::uuid
     and quest_starts_allowed = true) as "allowedQuestStarts";
`;

export function assertBootstrapConfiguration(
  configuration: BootstrapConfiguration,
): void {
  if (
    configuration.productionProjectRef !== PRODUCTION_PROJECT_REF ||
    configuration.loadProjectRef !== LOAD_PROJECT_REF ||
    configuration.supabaseUrl !== PRODUCTION_URL
  ) {
    throw new Error("Production identity validation failed.");
  }
  if (
    configuration.retentionDays !== 90 ||
    configuration.authorizationId !== BOOTSTRAP_AUTHORIZATION_ID
  ) {
    throw new Error("Retention authorization validation failed.");
  }
  if (!configuration.secretKey.trim() || !configuration.accessToken.trim()) {
    throw new Error("Protected bootstrap credential is missing.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuration.teacherEmail)) {
    throw new Error("Teacher email validation failed.");
  }
  if (
    configuration.teacherPassword.length < 8 ||
    !/[A-Za-z]/.test(configuration.teacherPassword) ||
    !/[0-9]/.test(configuration.teacherPassword) ||
    !/[^A-Za-z0-9]/.test(configuration.teacherPassword)
  ) {
    throw new Error("Teacher credential policy validation failed.");
  }
}

export async function bootstrapProductionClassroom(
  configuration: BootstrapConfiguration,
  dependencies: BootstrapDependencies,
): Promise<BootstrapReceipt> {
  assertBootstrapConfiguration(configuration);

  try {
    const retentionDays = await dependencies.updateRetention(90, "course-owner");
    if (retentionDays !== 90) throw new Error("unexpected retention receipt");
  } catch {
    throw new Error("BOOTSTRAP_RETENTION_FAILED");
  }

  let teacher: BootstrapUser;
  try {
    const existingTeacher = await dependencies.findTeacherByEmail(
      configuration.teacherEmail,
    );
    if (existingTeacher) {
      if (
        existingTeacher.bootstrapAuthorizationId !==
          configuration.authorizationId
      ) {
        throw new Error("BOOTSTRAP_ACCOUNT_CONFLICT");
      }
      teacher = existingTeacher;
    } else {
      teacher = await dependencies.createTeacher({
        email: configuration.teacherEmail,
        password: configuration.teacherPassword,
        authorizationId: configuration.authorizationId,
      });
      if (
        teacher.bootstrapAuthorizationId !== configuration.authorizationId
      ) {
        throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "BOOTSTRAP_ACCOUNT_CONFLICT"
    ) {
      throw error;
    }
    throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
  }

  try {
    await dependencies.ensureTeacherRole(teacher.id);
  } catch {
    throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
  }

  let cohort: BootstrapCohort;
  try {
    cohort =
      (await dependencies.findSmokeCohort(teacher.id)) ??
      (await dependencies.createSmokeCohort(teacher.id));
  } catch {
    throw new Error("BOOTSTRAP_COHORT_FAILED");
  }
  if (
    cohort.teacherId !== teacher.id ||
    cohort.title !== "Production Classroom" ||
    cohort.groupCount !== 5 ||
    cohort.groupCapacity !== 6 ||
    cohort.archivedAt !== null
  ) {
    throw new Error("BOOTSTRAP_COHORT_INVALID");
  }

  try {
    await dependencies.verifyClosedClassroom(teacher.id, cohort.id);
  } catch {
    throw new Error("BOOTSTRAP_VERIFICATION_FAILED");
  }

  return {
    teacherId: teacher.id,
    cohortId: cohort.id,
    retentionDays: 90,
    groupCount: 5,
    groupCapacity: 6,
  };
}

type BootstrapEnvironment = Record<string, string | undefined>;

export function bootstrapConfigurationFromEnvironment(
  environment: BootstrapEnvironment,
): BootstrapConfiguration {
  return {
    supabaseUrl: environment.PRODUCTION_SUPABASE_URL ?? "",
    productionProjectRef:
      environment.PRODUCTION_SUPABASE_PROJECT_REF ?? "",
    loadProjectRef: environment.LOAD_SUPABASE_PROJECT_REF ?? "",
    secretKey: environment.PRODUCTION_SUPABASE_SECRET_KEY ?? "",
    accessToken: environment.SUPABASE_ACCESS_TOKEN ?? "",
    teacherEmail: environment.PRODUCTION_TEACHER_EMAIL ?? "",
    teacherPassword: environment.PRODUCTION_TEACHER_PASSWORD ?? "",
    retentionDays: Number(environment.PRODUCTION_RETENTION_DAYS),
    authorizationId: environment.BOOTSTRAP_AUTHORIZATION_ID ?? "",
  };
}

function cohortFromRow(row: Record<string, unknown>): BootstrapCohort {
  return {
    id: String(row.id),
    teacherId: String(row.teacher_id),
    title: String(row.title),
    groupCount: Number(row.group_count),
    groupCapacity: Number(row.group_capacity),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
  };
}

export function createProductionBootstrapDependencies(
  configuration: BootstrapConfiguration,
  fetchImplementation: typeof fetch = fetch,
): BootstrapDependencies {
  assertBootstrapConfiguration(configuration);
  authClientSequence += 1;
  const admin = createClient(
    configuration.supabaseUrl,
    configuration.secretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `campus-quest-production-bootstrap-${authClientSequence}`,
      },
      global: { fetch: fetchImplementation },
    },
  );

  return {
    async updateRetention(days, approver) {
      try {
        const response = await fetchImplementation(
          `https://api.supabase.com/v1/projects/${configuration.productionProjectRef}/database/query`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${configuration.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: RETENTION_QUERY,
              parameters: [days, approver],
              read_only: false,
            }),
          },
        );
        if (response.status !== 201) {
          throw new Error("unexpected Management API status");
        }
        const data: unknown = await response.json();
        const row = Array.isArray(data) ? data[0] : undefined;
        if (
          !row || typeof row !== "object" ||
          Number((row as Record<string, unknown>).retentionDays) !== 90
        ) {
          throw new Error("unexpected retention receipt");
        }
        return 90;
      } catch {
        throw new Error("BOOTSTRAP_RETENTION_FAILED");
      }
    },

    async findTeacherByEmail(email) {
      const normalizedEmail = email.trim().toLowerCase();
      for (let page = 1; page <= 100; page += 1) {
        const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (result.error) throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
        const match = result.data.users.find(
          (user) => user.email?.trim().toLowerCase() === normalizedEmail,
        );
        if (match) {
          const marker = match.app_metadata.bootstrapAuthorizationId;
          return {
            id: match.id,
            ...(typeof marker === "string"
              ? { bootstrapAuthorizationId: marker }
              : {}),
          };
        }
        if (result.data.users.length < 1000) return null;
      }
      throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
    },

    async createTeacher(input) {
      const result = await admin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        app_metadata: {
          role: "teacher",
          bootstrapAuthorizationId: input.authorizationId,
        },
      });
      const user = result.data.user;
      if (result.error || !user) throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
      const marker = user.app_metadata.bootstrapAuthorizationId;
      return {
        id: user.id,
        ...(typeof marker === "string"
          ? { bootstrapAuthorizationId: marker }
          : {}),
      };
    },

    async ensureTeacherRole(teacherId) {
      const existing = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", teacherId)
        .limit(1);
      if (existing.error) throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
      const role = existing.data?.[0]?.role;
      if (role === "teacher") return;
      if (role !== undefined) throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
      const inserted = await admin.from("user_roles").insert({
        user_id: teacherId,
        role: "teacher",
      });
      if (inserted.error) throw new Error("BOOTSTRAP_ACCOUNT_FAILED");
    },

    async findSmokeCohort(teacherId) {
      const result = await admin
        .from("cohorts")
        .select(
          "id,teacher_id,title,group_count,group_capacity,archived_at",
        )
        .eq("teacher_id", teacherId)
        .eq("title", "Production Classroom")
        .limit(1);
      if (result.error) throw new Error("BOOTSTRAP_COHORT_FAILED");
      const row = result.data?.[0] as Record<string, unknown> | undefined;
      return row ? cohortFromRow(row) : null;
    },

    async createSmokeCohort(teacherId) {
      const result = await admin
        .from("cohorts")
        .insert({
          teacher_id: teacherId,
          title: "Production Classroom",
          group_count: 5,
          group_capacity: 6,
        })
        .select(
          "id,teacher_id,title,group_count,group_capacity,archived_at",
        )
        .single();
      if (result.error || !result.data) {
        throw new Error("BOOTSTRAP_COHORT_FAILED");
      }
      return cohortFromRow(result.data as Record<string, unknown>);
    },

    async verifyClosedClassroom(teacherId, cohortId) {
      let data: unknown;
      try {
        const response = await fetchImplementation(
          `https://api.supabase.com/v1/projects/${configuration.productionProjectRef}/database/query`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${configuration.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: CLASSROOM_VERIFICATION_QUERY,
              parameters: [cohortId, teacherId],
              read_only: true,
            }),
          },
        );
        if (response.status !== 201) {
          throw new Error("unexpected Management API status");
        }
        data = await response.json();
      } catch {
        throw new Error("BOOTSTRAP_VERIFICATION_FAILED");
      }
      const receipt = Array.isArray(data) ? data[0] : undefined;
      if (
        !receipt || typeof receipt !== "object" ||
        (receipt as Record<string, unknown>).cohortValid !== true ||
        Number((receipt as Record<string, unknown>).groupCount) !== 5 ||
        Number((receipt as Record<string, unknown>).openJoinWindows) !== 0 ||
        Number((receipt as Record<string, unknown>).allowedQuestStarts) !== 0
      ) {
        throw new Error("BOOTSTRAP_VERIFICATION_FAILED");
      }
    },
  };
}

async function main(): Promise<void> {
  const configuration = bootstrapConfigurationFromEnvironment(process.env);
  const receipt = await bootstrapProductionClassroom(
    configuration,
    createProductionBootstrapDependencies(configuration),
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
