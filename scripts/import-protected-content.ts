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
  secretKey: string;
  confirmedProjectRef?: string;
  expectedContentVersion?: string;
}

function projectRefFromUrl(url: string): string {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  if (["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
    return "local";
  }
  const suffix = ".supabase.co";
  const projectRef = hostname.slice(0, -suffix.length);
  if (
    parsed.protocol !== "https:" ||
    !hostname.endsWith(suffix) ||
    !/^[a-z0-9]{20}$/.test(projectRef) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("SUPABASE_URL must use an HTTPS project root.");
  }
  return projectRef;
}

export function assertImportConfiguration(
  configuration: ImportConfiguration,
): string {
  if (!configuration.secretKey.trim()) {
    throw new Error("A privileged Supabase secret key is required for protected import.");
  }

  const projectRef = projectRefFromUrl(configuration.supabaseUrl);
  if (projectRef !== "local" && configuration.confirmedProjectRef !== projectRef) {
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
  if (
    configuration.expectedContentVersion &&
    configuration.expectedContentVersion !== validated.version
  ) {
    throw new Error("Protected content version does not match the approved version.");
  }
  const client = createClient(
    configuration.supabaseUrl,
    configuration.secretKey,
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
  const expectedContentVersion = process.argv
    .find((argument) => argument.startsWith("--expected-content-version="))
    ?.split("=", 2)[1];
  const bankPath = resolve(
    process.argv.find((argument) => argument.endsWith(".json")) ??
      "protected-content/generated/question-bank.json",
  );
  const configuration: ImportConfiguration = {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    secretKey:
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
    ...(confirmedProjectRef ? { confirmedProjectRef } : {}),
    ...(expectedContentVersion ? { expectedContentVersion } : {}),
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
