import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BOOTSTRAP_ID =
  /^frcq-bootstrap-([0-9]{8}T[0-9]{6}Z)-[a-f0-9]{8}$/;
const MODES = new Set(["bootstrap", "disposable-upgrade", "in-place-upgrade"]);
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const REMOVED_RECOVERY_FIELDS = [
  "backupEvidenceId",
  "backupCreatedAtUtc",
  "backupArchiveSha256",
  "restoreRehearsalEvidenceId",
];

function fail(message) {
  throw new Error(`Production release authorization invalid: ${message}`);
}

function validateBootstrapAuthorizationId(value, now) {
  if (typeof value !== "string") fail("bootstrap authorization ID is required");
  const match = BOOTSTRAP_ID.exec(value);
  if (!match) fail("bootstrap authorization ID format");

  const compact = match[1];
  const canonical = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    + `T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`;
  const timestamp = new Date(canonical);
  if (
    Number.isNaN(timestamp.valueOf()) ||
    timestamp.toISOString().replace(".000Z", "Z") !== canonical
  ) {
    fail("bootstrap authorization ID timestamp");
  }
  if (timestamp.valueOf() - now.valueOf() > MAX_FUTURE_SKEW_MS) {
    fail("bootstrap authorization timestamp is in the future");
  }
  return value;
}

export function validateReleaseAuthorization(input, { now = new Date() } = {}) {
  const releaseMode = input?.releaseMode;
  if (!MODES.has(releaseMode)) {
    fail("release mode must be bootstrap, disposable-upgrade, or in-place-upgrade");
  }
  if (REMOVED_RECOVERY_FIELDS.some((name) => name in (input ?? {}))) {
    fail("recovery evidence is not supported");
  }

  if (releaseMode === "bootstrap") {
    return Object.freeze({
      releaseMode,
      bootstrapAuthorizationId: validateBootstrapAuthorizationId(
        input?.bootstrapAuthorizationId,
        now,
      ),
    });
  }

  if (input?.bootstrapAuthorizationId !== "") {
    fail(`${releaseMode} bootstrap authorization ID must be empty`);
  }
  return Object.freeze({
    releaseMode,
    bootstrapAuthorizationId: "",
  });
}

export function readReleaseAuthorization(environment, options) {
  return validateReleaseAuthorization({
    releaseMode: environment.RELEASE_MODE,
    bootstrapAuthorizationId: environment.BOOTSTRAP_AUTHORIZATION_ID,
  }, options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.stdout.write(`${JSON.stringify(readReleaseAuthorization(process.env))}\n`);
}
