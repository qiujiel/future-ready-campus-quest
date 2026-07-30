import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  measureJavaScriptGzip,
  scanBundle,
} from "../scripts/check-bundle.mjs";

const temporaryDirectories = [];

async function temporaryBundle() {
  const directory = await mkdtemp(join(tmpdir(), "campus-quest-bundle-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

it("accepts a synthetic public bundle with no protected markers", async () => {
  const directory = await temporaryBundle();
  await writeFile(join(directory, "app.js"), "public synthetic fixture");

  await expect(scanBundle(directory)).resolves.toEqual([]);
});

it("fails when a seeded answer-key marker reaches a fixture bundle", async () => {
  const directory = await temporaryBundle();
  await writeFile(
    join(directory, "app.js"),
    "SYNTHETIC_CORRECT_OPTION_DO_NOT_SHIP",
  );

  await expect(scanBundle(directory)).resolves.toEqual([
    expect.objectContaining({
      marker: "synthetic-answer-key",
      path: expect.stringContaining("app.js"),
    }),
  ]);
});

it("measures compressed JavaScript for the public budget gate", async () => {
  const directory = await temporaryBundle();
  await writeFile(join(directory, "app.js"), "const publicShell = true;");
  await writeFile(join(directory, "styles.css"), "body { color: navy; }");

  await expect(measureJavaScriptGzip(directory)).resolves.toEqual(
    expect.objectContaining({
      fileCount: 1,
      gzipBytes: expect.any(Number),
    }),
  );
});
