import { describe, expect, it } from "vitest";
import {
  readReleaseAuthorization,
  validateReleaseAuthorization,
} from "../../scripts/production-release-authorization.mjs";

const now = new Date("2026-08-07T12:05:00Z");

const bootstrap = {
  releaseMode: "bootstrap",
  bootstrapAuthorizationId: "frcq-bootstrap-20260807T120000Z-a1b2c3d4",
};

const disposableUpgrade = {
  releaseMode: "disposable-upgrade",
  bootstrapAuthorizationId: "",
};

const inPlaceUpgrade = {
  releaseMode: "in-place-upgrade",
  bootstrapAuthorizationId: "",
};

describe("production release authorization", () => {
  it("accepts bootstrap only with a canonical bootstrap authorization identifier", () => {
    expect(validateReleaseAuthorization(bootstrap, { now })).toEqual({
      releaseMode: "bootstrap",
      bootstrapAuthorizationId: bootstrap.bootstrapAuthorizationId,
    });
  });

  it.each([
    ["backupEvidenceId", "frcq-backup-20260807T100000Z-a1b2c3d4"],
    ["backupCreatedAtUtc", "2026-08-07T10:00:00Z"],
    ["backupArchiveSha256", "a".repeat(64)],
    ["restoreRehearsalEvidenceId", "frcq-restore-20260807T110000Z-b1c2d3e4"],
  ])("rejects removed recovery field %s", (name, value) => {
    expect(() => validateReleaseAuthorization({
      ...disposableUpgrade,
      [name]: value,
    }, { now })).toThrow(/recovery.*not supported/i);
  });

  it("accepts disposable-upgrade with a blank bootstrap authorization identifier", () => {
    expect(validateReleaseAuthorization(disposableUpgrade, { now })).toEqual({
      releaseMode: "disposable-upgrade",
      bootstrapAuthorizationId: "",
    });
  });

  it("accepts in-place-upgrade with a blank bootstrap authorization identifier", () => {
    expect(validateReleaseAuthorization(inPlaceUpgrade, { now })).toEqual({
      releaseMode: "in-place-upgrade",
      bootstrapAuthorizationId: "",
    });
  });

  it("rejects a bootstrap authorization ID in in-place-upgrade mode", () => {
    expect(() => validateReleaseAuthorization({
      ...inPlaceUpgrade,
      bootstrapAuthorizationId: bootstrap.bootstrapAuthorizationId,
    }, { now })).toThrow(/in-place-upgrade.*bootstrap/i);
  });

  it("rejects a bootstrap authorization ID in disposable-upgrade mode", () => {
    expect(() => validateReleaseAuthorization({
      ...disposableUpgrade,
      bootstrapAuthorizationId: bootstrap.bootstrapAuthorizationId,
    }, { now })).toThrow(/disposable-upgrade.*bootstrap/i);
  });

  it.each(["", "Bootstrap", "initial", "upgrade", "disposable-upgrade ", "in-place-upgrade "])(
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
      RELEASE_MODE: "disposable-upgrade",
      BOOTSTRAP_AUTHORIZATION_ID: "",
      PRODUCTION_SUPABASE_DB_PASSWORD: "ignored-secret",
      SUPABASE_ACCESS_TOKEN: "ignored-secret",
    }, { now })).toEqual({
      releaseMode: "disposable-upgrade",
      bootstrapAuthorizationId: "",
    });
  });
});
