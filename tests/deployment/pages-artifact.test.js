import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPagesArtifact,
  verifyPagesArtifact,
} from "../../scripts/pages-artifact.mjs";

const commitSha = "a".repeat(40);
const temporaryDirectories = [];

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "campus-quest-artifact-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), "<main>Campus Quest</main>\n");
  await writeFile(join(directory, "assets", "app.js"), "export {};\n");
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      const { rm } = await import("node:fs/promises");
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("Pages artifact integrity", () => {
  it("creates sorted metadata and verifies the exact directory", async () => {
    const directory = await fixture();
    const outputDirectory = await mkdtemp(join(tmpdir(), "campus-quest-output-"));
    temporaryDirectories.push(outputDirectory);
    const outputFile = join(outputDirectory, "github-output.txt");

    const created = await createPagesArtifact(directory, {
      commitSha,
      runId: "12345",
      outputFile,
    });

    expect(created).toMatchObject({ commitSha, fileCount: 3 });
    expect(created.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
    const manifest = await readFile(
      join(directory, "artifact-sha256.txt"),
      "utf8",
    );
    expect(
      manifest.trim().split("\n").map((line) => line.split("  ")[1]),
    ).toEqual(["assets/app.js", "index.html", "release-metadata.json"]);
    expect(JSON.parse(await readFile(
      join(directory, "release-metadata.json"),
      "utf8",
    ))).toEqual({ schemaVersion: 1, commitSha, workflowRunId: "12345" });
    expect(await readFile(outputFile, "utf8")).toContain(
      `manifest_digest=${created.manifestDigest}`,
    );

    await expect(verifyPagesArtifact(directory, {
      expectedCommitSha: commitSha,
      expectedManifestDigest: created.manifestDigest,
    })).resolves.toEqual(created);
  });

  it("rejects an artifact whose public file changed after packaging", async () => {
    const directory = await fixture();
    const created = await createPagesArtifact(directory, {
      commitSha,
      runId: "12345",
    });
    await writeFile(join(directory, "index.html"), "tampered\n");

    await expect(verifyPagesArtifact(directory, {
      expectedCommitSha: commitSha,
      expectedManifestDigest: created.manifestDigest,
    })).rejects.toThrow(/checksum mismatch.*index\.html/i);
  });

  it("rejects a prior artifact with the wrong commit identity", async () => {
    const directory = await fixture();
    const created = await createPagesArtifact(directory, {
      commitSha,
      runId: "12345",
    });

    await expect(verifyPagesArtifact(directory, {
      expectedCommitSha: "b".repeat(40),
      expectedManifestDigest: created.manifestDigest,
    })).rejects.toThrow(/commit identity/i);
  });

  it("rejects symbolic links from the public artifact", async () => {
    const directory = await fixture();
    await symlink("index.html", join(directory, "linked-index.html"));

    await expect(createPagesArtifact(directory, {
      commitSha,
      runId: "12345",
    })).rejects.toThrow(/symbolic link/i);
  });

  it("rejects hidden entries excluded by upload-pages-artifact", async () => {
    const directory = await fixture();
    await writeFile(join(directory, ".nojekyll"), "\n");

    await expect(createPagesArtifact(directory, {
      commitSha,
      runId: "12345",
    })).rejects.toThrow(/hidden.*upload-pages-artifact/i);
  });
});
