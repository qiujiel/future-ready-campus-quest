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
