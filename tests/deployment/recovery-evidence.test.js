import { describe, expect, it } from "vitest";
import {
  readRecoveryEvidence,
  validateRecoveryEvidence,
} from "../../scripts/recovery-evidence.mjs";

const valid = {
  backupEvidenceId: "frcq-backup-20260804T010203Z-a1b2c3d4",
  backupCreatedAtUtc: "2026-08-04T01:02:03Z",
  backupArchiveSha256: "a".repeat(64),
  restoreRehearsalEvidenceId: "frcq-restore-20260804T030405Z-b1c2d3e4",
};
const now = new Date("2026-08-04T04:00:00Z");

describe("Free-plan recovery evidence", () => {
  it("accepts canonical redaction-safe evidence within 24 hours", () => {
    expect(validateRecoveryEvidence(valid, { now })).toEqual(valid);
  });

  it("maps only the four approved environment values", () => {
    expect(readRecoveryEvidence({
      BACKUP_EVIDENCE_ID: valid.backupEvidenceId,
      BACKUP_CREATED_AT_UTC: valid.backupCreatedAtUtc,
      BACKUP_ARCHIVE_SHA256: valid.backupArchiveSha256,
      RESTORE_REHEARSAL_EVIDENCE_ID: valid.restoreRehearsalEvidenceId,
      PRODUCTION_SUPABASE_DB_PASSWORD: "ignored-secret",
    }, { now })).toEqual(valid);
  });

  it.each([
    ["backupEvidenceId", "backup-20260804"],
    ["backupArchiveSha256", "A".repeat(64)],
    ["restoreRehearsalEvidenceId", "frcq-restore-class-a1b2c3d4"],
    ["backupCreatedAtUtc", "2026-08-04T01:02:03.000Z"],
    ["backupCreatedAtUtc", "2026-02-30T01:02:03Z"],
  ])("rejects malformed %s", (name, value) => {
    expect(() => validateRecoveryEvidence({ ...valid, [name]: value }, { now }))
      .toThrow(/recovery evidence invalid/i);
  });

  it("rejects a backup older than 24 hours", () => {
    expect(() => validateRecoveryEvidence({
      ...valid,
      backupCreatedAtUtc: "2026-08-03T03:59:59Z",
    }, { now })).toThrow(/less than 24 hours old/i);
  });

  it("rejects a timestamp more than five minutes in the future", () => {
    expect(() => validateRecoveryEvidence({
      ...valid,
      backupCreatedAtUtc: "2026-08-04T04:05:01Z",
    }, { now })).toThrow(/future/i);
  });
});
