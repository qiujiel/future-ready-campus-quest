import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { importProtectedContent } from "./import-protected-content.ts";
import {
  type ContentBank,
  validateContentBank,
} from "./protected-content.schema.ts";

export interface LocalClassroomConfiguration {
  supabaseUrl: string;
  serviceRoleKey: string;
  teacherEmail: string;
  teacherPassword: string;
  bank: ContentBank;
  cohortTitle?: string;
  groupCount?: number;
  groupCapacity?: number;
  allowSyntheticContent?: boolean;
}

export function assertLocalSupabaseUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Local classroom bootstrap refuses non-local Supabase URLs.");
  }
  return url;
}

export async function bootstrapLocalClassroom(
  configuration: LocalClassroomConfiguration,
): Promise<{
  project: "local";
  teacherId: string;
  cohortId: string;
  cohortTitle: string;
  groupCount: number;
  groupCapacity: number;
  content: { version: string; itemCount: number; conceptCount: number };
}> {
  assertLocalSupabaseUrl(configuration.supabaseUrl);
  if (!configuration.serviceRoleKey.trim()) {
    throw new Error("The local service-role key is required.");
  }
  if (!configuration.teacherEmail.trim() || configuration.teacherPassword.length < 12) {
    throw new Error("Local teacher credentials are incomplete.");
  }

  const bank = validateContentBank(configuration.bank, {
    production: !configuration.allowSyntheticContent,
  });
  const content = await importProtectedContent(bank, {
    supabaseUrl: configuration.supabaseUrl,
    secretKey: configuration.serviceRoleKey,
    ...(configuration.allowSyntheticContent
      ? { allowSyntheticContent: true }
      : {}),
  });
  const admin = createClient(
    configuration.supabaseUrl,
    configuration.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("Local teacher lookup failed.");
  let teacher = users.data.users.find(
    (candidate) => candidate.email === configuration.teacherEmail,
  );
  if (teacher) {
    const updated = await admin.auth.admin.updateUserById(teacher.id, {
      password: configuration.teacherPassword,
      email_confirm: true,
      app_metadata: { role: "teacher" },
    });
    if (updated.error || !updated.data.user) {
      throw new Error("Local teacher update failed.");
    }
    teacher = updated.data.user;
  } else {
    const created = await admin.auth.admin.createUser({
      email: configuration.teacherEmail,
      password: configuration.teacherPassword,
      email_confirm: true,
      app_metadata: { role: "teacher" },
    });
    if (created.error || !created.data.user) {
      throw new Error("Local teacher creation failed.");
    }
    teacher = created.data.user;
  }

  const existingRole = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", teacher.id)
    .maybeSingle();
  if (existingRole.error || existingRole.data?.role === "student") {
    throw new Error("Local teacher role lookup failed.");
  }
  if (!existingRole.data) {
    const role = await admin.from("user_roles").insert({
      user_id: teacher.id,
      role: "teacher",
    });
    if (role.error) throw new Error("Local teacher role creation failed.");
  }

  const cohortTitle = configuration.cohortTitle ?? "Student-ready local classroom";
  const groupCount = configuration.groupCount ?? 3;
  const groupCapacity = configuration.groupCapacity ?? 4;
  const existing = await admin
    .from("cohorts")
    .select("id")
    .eq("teacher_id", teacher.id)
    .eq("title", cohortTitle)
    .maybeSingle();
  if (existing.error) throw new Error("Local cohort lookup failed.");
  let cohortId = existing.data?.id as string | undefined;
  if (!cohortId) {
    const created = await admin
      .from("cohorts")
      .insert({
        teacher_id: teacher.id,
        title: cohortTitle,
        group_count: groupCount,
        group_capacity: groupCapacity,
      })
      .select("id")
      .single();
    if (created.error) throw new Error("Local cohort creation failed.");
    cohortId = String(created.data.id);
  }

  return {
    project: "local",
    teacherId: teacher.id,
    cohortId,
    cohortTitle,
    groupCount,
    groupCapacity,
    content,
  };
}

async function main() {
  const bankPath = resolve(
    process.argv.find((argument) => argument.endsWith(".json")) ??
      "protected-content/generated/question-bank.json",
  );
  const bank = JSON.parse(await readFile(bankPath, "utf8")) as unknown;
  const allowSyntheticContent = process.env.LOCAL_SYNTHETIC_CONTENT === "1";
  const receipt = await bootstrapLocalClassroom({
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    teacherEmail: process.env.LOCAL_TEACHER_EMAIL ?? "",
    teacherPassword: process.env.LOCAL_TEACHER_PASSWORD ?? "",
    bank: validateContentBank(bank, { production: !allowSyntheticContent }),
    allowSyntheticContent,
  });
  console.log(JSON.stringify(receipt));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
