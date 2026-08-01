import { describe, expect, it } from "vitest";
import {
  readinessSecretMatches,
} from "../functions/production-readiness/core";

describe("production readiness authorization", () => {
  const configured = "configured-readiness-secret-at-least-32-bytes";

  it("accepts only the exact dedicated readiness secret", async () => {
    await expect(readinessSecretMatches(configured, configured)).resolves
      .toBe(true);
    await expect(readinessSecretMatches("different-readiness-secret-32-bytes", configured))
      .resolves.toBe(false);
  });

  it("rejects missing or weak server configuration", async () => {
    await expect(readinessSecretMatches(undefined, configured)).resolves
      .toBe(false);
    await expect(readinessSecretMatches(configured, "too-short")).resolves
      .toBe(false);
  });
});
