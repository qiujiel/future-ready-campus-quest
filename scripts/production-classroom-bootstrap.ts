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

export function assertBootstrapConfiguration(
  configuration: BootstrapConfiguration,
): void {
  if (
    configuration.productionProjectRef !== PRODUCTION_PROJECT_REF ||
    configuration.loadProjectRef !== LOAD_PROJECT_REF ||
    configuration.productionProjectRef === configuration.loadProjectRef ||
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
