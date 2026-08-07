import { describe, expect, it } from "vitest";
import {
  readReleaseAuthorization,
  validateReleaseAuthorization,
} from "../../scripts/production-release-authorization.mjs";

const now = new Date("2026-08-07T12:05:00Z");

const validRecoveryEvidence = {
  backupEvidenceId: "frcq-backup-20260807T100000Z-a1b2c3d4",
  backupCreatedAtUtc: "2026-08-07T10:00:00Z",
  backupArchiveSha256: "a".repeat(64),
  restoreRehearsalEvidenceId: "frcq-restore-20260807T110000Z-b1c2d3e4",
};

const bootstrap = {
  releaseMode: "bootstrap",
  bootstrapAuthorizationId: "frcq-bootstrap-20260807T120000Z-a1b2c3d4",
  backupEvidenceId: "",
  backupCreatedAtUtc: "",
  backupArchiveSha256: "",
  restoreRehearsalEvidenceId: "",
};

const upgrade = {
  releaseMode: "upgrade",
  bootstrapAuthorizationId: "",
  ...validRecoveryEvidence,
};

describe("production release authorization", () => {
  it("accepts bootstrap only with canonical bootstrap evidence and blank recovery evidence", () => {
    expect(validateReleaseAuthorization(bootstrap, { now })).toEqual({
      releaseMode: "bootstrap",
      bootstrapAuthorizationId: bootstrap.bootstrapAuthorizationId,
      recoveryEvidence: null,
    });
  });

  it.each([
    ["backupEvidenceId", validRecoveryEvidence.backupEvidenceId],
    ["backupCreatedAtUtc", validRecoveryEvidence.backupCreatedAtUtc],
    ["backupArchiveSha256", validRecoveryEvidence.backupArchiveSha256],
    ["restoreRehearsalEvidenceId", validRecoveryEvidence.restoreRehearsalEvidenceId],
  ])("rejects recovery field %s in bootstrap mode", (name, value) => {
    expect(() => validateReleaseAuthorization({
      ...bootstrap,
      [name]: value,
    }, { now })).toThrow(/bootstrap.*recovery/i);
  });

  it("accepts upgrade only with the four existing recovery fields", () => {
    expect(validateReleaseAuthorization(upgrade, { now })).toEqual({
      releaseMode: "upgrade",
      bootstrapAuthorizationId: "",
      recoveryEvidence: validRecoveryEvidence,
    });
  });

  it("rejects a bootstrap authorization ID in upgrade mode", () => {
    expect(() => validateReleaseAuthorization({
      ...upgrade,
      bootstrapAuthorizationId: bootstrap.bootstrapAuthorizationId,
    }, { now })).toThrow(/upgrade.*bootstrap/i);
  });

  it("delegates upgrade recovery validation to the existing strict validator", () => {
    expect(() => validateReleaseAuthorization({
      ...upgrade,
      backupArchiveSha256: "",
    }, { now })).toThrow(/recovery evidence invalid/i);
  });

  it.each(["", "Bootstrap", "initial", "upgrade "])(
    "rejects noncanonical release mode %j",
    (releaseMode) => {
      expect(() => validateReleaseAuthorization({
        ...bootstrap,
        releaseMode,
      }, { now })).toThrow(/release mode/i);
    },
  );

  it.each([
    "bootstrap-20260807",
    "frcq-bootstrap-20260807T120000Z-A1B2C3D4",
    "frcq-bootstrap-20260230T120000Z-a1b2c3d4",
  ])("rejects malformed bootstrap authorization ID %s", (bootstrapAuthorizationId) => {
    expect(() => validateReleaseAuthorization({
      ...bootstrap,
      bootstrapAuthorizationId,
    }, { now })).toThrow(/bootstrap authorization/i);
  });

  it("rejects a bootstrap authorization timestamp more than five minutes in the future", () => {
    expect(() => validateReleaseAuthorization({
      ...bootstrap,
      bootstrapAuthorizationId: "frcq-bootstrap-20260807T121001Z-a1b2c3d4",
    }, { now })).toThrow(/future/i);
  });

  it("maps only approved dispatch values and ignores unrelated secrets", () => {
    expect(readReleaseAuthorization({
      RELEASE_MODE: "bootstrap",
      BOOTSTRAP_AUTHORIZATION_ID: bootstrap.bootstrapAuthorizationId,
      BACKUP_EVIDENCE_ID: "",
      BACKUP_CREATED_AT_UTC: "",
      BACKUP_ARCHIVE_SHA256: "",
      RESTORE_REHEARSAL_EVIDENCE_ID: "",
      PRODUCTION_SUPABASE_DB_PASSWORD: "ignored-secret",
      SUPABASE_ACCESS_TOKEN: "ignored-secret",
    }, { now })).toEqual({
      releaseMode: "bootstrap",
      bootstrapAuthorizationId: bootstrap.bootstrapAuthorizationId,
      recoveryEvidence: null,
    });
  });
});
