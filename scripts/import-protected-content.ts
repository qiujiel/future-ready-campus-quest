import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  type ContentBank,
  validateContentBank,
} from "./protected-content.schema.ts";

export interface ImportConfiguration {
  supabaseUrl: string;
  serviceRoleKey: string;
  productionProjectRef?: string;
  confirmedProjectRef?: string;
}

function projectRefFromUrl(url: string): string {
  const hostname = new URL(url).hostname;
  if (["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
    return "local";
  }
  const suffix = ".supabase.co";
  if (!hostname.endsWith(suffix)) {
    throw new Error("SUPABASE_URL must use a Supabase project hostname.");
  }
  return hostname.slice(0, -suffix.length);
}

export function assertImportConfiguration(
  configuration: ImportConfiguration,
): string {
  if (!configuration.serviceRoleKey.trim()) {
    throw new Error("A service-role key is required for protected import.");
  }

  const projectRef = projectRefFromUrl(configuration.supabaseUrl);
  if (
    configuration.productionProjectRef &&
    projectRef === configuration.productionProjectRef &&
    configuration.confirmedProjectRef !== projectRef
  ) {
    throw new Error(
      `Production import requires --confirm-project-ref=${projectRef}.`,
    );
  }
  return projectRef;
}

export async function importProtectedContent(
  bank: ContentBank,
  configuration: ImportConfiguration,
): Promise<{ itemCount: number; conceptCount: number; version: string }> {
  assertImportConfiguration(configuration);
  const validated = validateContentBank(bank, { production: true });
  const client = createClient(
    configuration.supabaseUrl,
    configuration.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const result = await client.rpc("import_learning_content", {
    payload: validated,
  });
  if (result.error) {
    throw new Error(`Protected import was rejected: ${result.error.code}`);
  }
  const receipt = result.data as {
    itemCount?: number;
    conceptCount?: number;
    version?: string;
  };
  if (
    receipt.itemCount !== 24 ||
    receipt.conceptCount !== 8 ||
    receipt.version !== validated.version
  ) {
    throw new Error("Protected import returned an invalid count receipt.");
  }
  return {
    itemCount: receipt.itemCount,
    conceptCount: receipt.conceptCount,
    version: receipt.version,
  };
}

async function main(): Promise<void> {
  const confirmedProjectRef = process.argv
    .find((argument) => argument.startsWith("--confirm-project-ref="))
    ?.split("=", 2)[1];
  const bankPath = resolve(
    process.argv.find((argument) => argument.endsWith(".json")) ??
      "protected-content/generated/question-bank.json",
  );
  const configuration: ImportConfiguration = {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    ...(process.env.PRODUCTION_SUPABASE_PROJECT_REF
      ? { productionProjectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF }
      : {}),
    ...(confirmedProjectRef ? { confirmedProjectRef } : {}),
  };
  const bank = JSON.parse(await readFile(bankPath, "utf8")) as unknown;
  const receipt = await importProtectedContent(
    validateContentBank(bank, { production: true }),
    configuration,
  );
  console.log(JSON.stringify(receipt));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
