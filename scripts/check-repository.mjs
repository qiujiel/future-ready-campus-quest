import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const forbiddenTrackedPaths = [
  /(^|\/)protected-content\//i,
  /(^|\/)dflt-session-1-overview-of-ict-in-the-singapore-education-system-aug-2026\.pdf$/i,
  /(^|\/)dfrlt-session-1-21st-century-quality-learning-aug-26\.pdf$/i,
  /(^|\/)question-bank\.json$/i,
  /(^|\/)\.env(?:\.|$)/i,
];

const { stdout: trackedOutput } = await execFile(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
);
const { stdout: historyOutput } = await execFile(
  "git",
  ["rev-list", "--objects", "--all"],
  { encoding: "utf8" },
);
const tracked = trackedOutput.split("\0").filter(Boolean);
const historical = historyOutput
  .split("\n")
  .map((line) => line.slice(line.indexOf(" ") + 1))
  .filter((path) => path && !/^[a-f0-9]{40}$/.test(path));
const candidates = new Set([...tracked, ...historical]);
const violations = [...candidates].filter(
  (path) =>
    path !== ".env.example" &&
    forbiddenTrackedPaths.some((pattern) => pattern.test(path)),
);

if (violations.length > 0) {
  for (const path of violations) console.error(`forbidden tracked path: ${path}`);
  process.exitCode = 1;
} else {
  console.log("Repository privacy path and reachable-history check passed.");
}
