import { createHash } from "node:crypto";
import {
  appendFile,
  lstat,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MANIFEST_NAME = "artifact-sha256.txt";
const METADATA_NAME = "release-metadata.json";
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileDigest(path) {
  return sha256(await readFile(path));
}

function normalizedRelativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

async function regularFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Pages artifact cannot contain a symbolic link: ${normalizedRelativePath(root, path)}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const name = normalizedRelativePath(root, path);
        if (name !== MANIFEST_NAME) files.push({ name, path });
      } else {
        throw new Error(`Pages artifact contains an unsupported entry: ${entry.name}`);
      }
    }
  }
  await visit(root);
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

function requireCommitSha(value, label) {
  if (!COMMIT_SHA.test(value ?? "")) {
    throw new Error(`${label} must be a full lowercase commit SHA.`);
  }
  return value;
}

export async function createPagesArtifact(
  directory,
  { commitSha, runId, outputFile } = {},
) {
  const root = resolve(directory);
  await lstat(root);
  requireCommitSha(commitSha, "Artifact commit");
  if (!String(runId ?? "").trim()) {
    throw new Error("Artifact workflow run ID is required.");
  }
  await writeFile(
    resolve(root, METADATA_NAME),
    `${JSON.stringify({
      schemaVersion: 1,
      commitSha,
      workflowRunId: String(runId),
    }, null, 2)}\n`,
  );

  const files = await regularFiles(root);
  const lines = await Promise.all(
    files.map(async ({ name, path }) => `${await fileDigest(path)}  ${name}`),
  );
  const manifest = `${lines.join("\n")}\n`;
  await writeFile(resolve(root, MANIFEST_NAME), manifest);
  const manifestDigest = sha256(manifest);
  if (outputFile) {
    await appendFile(
      outputFile,
      `manifest_digest=${manifestDigest}\ncommit_sha=${commitSha}\n`,
    );
  }
  return { commitSha, manifestDigest, fileCount: files.length };
}

function parseManifest(value) {
  const entries = value.trim().split("\n").filter(Boolean).map((line) => {
    const match = line.match(/^([a-f0-9]{64}) {2}([^\r\n]+)$/);
    if (!match) throw new Error("Pages artifact manifest is malformed.");
    return { digest: match[1], name: match[2] };
  });
  const names = entries.map(({ name }) => name);
  if (new Set(names).size !== names.length) {
    throw new Error("Pages artifact manifest contains duplicate paths.");
  }
  return entries;
}

export async function verifyPagesArtifact(
  directory,
  { expectedCommitSha, expectedManifestDigest } = {},
) {
  const root = resolve(directory);
  requireCommitSha(expectedCommitSha, "Expected artifact commit");
  if (
    expectedManifestDigest &&
    !DIGEST.test(expectedManifestDigest)
  ) {
    throw new Error("Expected manifest digest must be lowercase SHA-256.");
  }
  const manifest = await readFile(resolve(root, MANIFEST_NAME), "utf8");
  const manifestDigest = sha256(manifest);
  if (
    expectedManifestDigest &&
    manifestDigest !== expectedManifestDigest
  ) {
    throw new Error("Pages artifact manifest digest does not match release evidence.");
  }
  const entries = parseManifest(manifest);
  const files = await regularFiles(root);
  if (
    entries.length !== files.length ||
    entries.some(({ name }, index) => name !== files[index]?.name)
  ) {
    throw new Error("Pages artifact file inventory does not match its manifest.");
  }
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const file = files[index];
    if (!entry || !file || await fileDigest(file.path) !== entry.digest) {
      throw new Error(`Pages artifact checksum mismatch: ${entry?.name ?? "unknown"}`);
    }
  }
  const metadata = JSON.parse(
    await readFile(resolve(root, METADATA_NAME), "utf8"),
  );
  if (metadata.schemaVersion !== 1 || metadata.commitSha !== expectedCommitSha) {
    throw new Error("Pages artifact commit identity does not match release evidence.");
  }
  return {
    commitSha: expectedCommitSha,
    manifestDigest,
    fileCount: files.length,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const [command, directory] = process.argv.slice(2);
  let result;
  if (command === "create" && directory) {
    result = await createPagesArtifact(directory, {
      commitSha: option("--commit"),
      runId: option("--run-id"),
      outputFile: process.env.GITHUB_OUTPUT,
    });
  } else if (command === "verify" && directory) {
    result = await verifyPagesArtifact(directory, {
      expectedCommitSha: option("--expected-commit"),
      expectedManifestDigest: option("--expected-digest"),
    });
  } else {
    throw new Error(
      "Usage: pages-artifact.mjs create|verify <directory> with release identity options.",
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
