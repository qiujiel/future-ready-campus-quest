import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BACKUP_ID = /^frcq-backup-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const RESTORE_ID = /^frcq-restore-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const UTC_SECONDS = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function fail(message) {
  throw new Error(`Recovery evidence invalid: ${message}`);
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) fail(`${name} is required`);
  return value;
}

function canonicalTimestamp(value) {
  if (!UTC_SECONDS.test(value)) fail("backupCreatedAtUtc must use canonical UTC seconds");
  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().replace(".000Z", "Z") !== value
  ) fail("backupCreatedAtUtc is not a real UTC timestamp");
  return parsed;
}

export function validateRecoveryEvidence(input, { now = new Date() } = {}) {
  const evidence = {
    backupEvidenceId: requiredString(input?.backupEvidenceId, "backupEvidenceId"),
    backupCreatedAtUtc: requiredString(input?.backupCreatedAtUtc, "backupCreatedAtUtc"),
    backupArchiveSha256: requiredString(input?.backupArchiveSha256, "backupArchiveSha256"),
    restoreRehearsalEvidenceId: requiredString(
      input?.restoreRehearsalEvidenceId,
      "restoreRehearsalEvidenceId",
    ),
  };
  if (!BACKUP_ID.test(evidence.backupEvidenceId)) fail("backupEvidenceId format");
  if (!SHA256.test(evidence.backupArchiveSha256)) fail("backupArchiveSha256 must be lowercase SHA-256");
  if (!RESTORE_ID.test(evidence.restoreRehearsalEvidenceId)) fail("restoreRehearsalEvidenceId format");
  const createdAt = canonicalTimestamp(evidence.backupCreatedAtUtc);
  const age = now.valueOf() - createdAt.valueOf();
  if (age >= MAX_AGE_MS) fail("backup must be less than 24 hours old");
  if (age < -MAX_FUTURE_SKEW_MS) fail("backup timestamp is in the future");
  return Object.freeze(evidence);
}

export function readRecoveryEvidence(environment, options) {
  return validateRecoveryEvidence({
    backupEvidenceId: environment.BACKUP_EVIDENCE_ID,
    backupCreatedAtUtc: environment.BACKUP_CREATED_AT_UTC,
    backupArchiveSha256: environment.BACKUP_ARCHIVE_SHA256,
    restoreRehearsalEvidenceId: environment.RESTORE_REHEARSAL_EVIDENCE_ID,
  }, options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const evidence = readRecoveryEvidence(process.env);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}
