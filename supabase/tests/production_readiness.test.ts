import { describe, expect, it } from "vitest";
import {
  APPLICATION_FUNCTION_NAMES,
  probeFunctionBoundaries,
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

  it("probes application functions server-side with the provider credential", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 405 }));

    await expect(probeFunctionBoundaries({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      anonKey: "provider-anon-key",
      serviceRoleKey: "provider-service-role-jwt",
      frontendOrigin: "https://school.example",
      fetcher,
    })).resolves.toEqual({ edgeFunctionsReady: 10 });
    expect(fetcher).toHaveBeenCalledTimes(APPLICATION_FUNCTION_NAMES.length);
    expect(fetcher).toHaveBeenCalledWith(
      "https://abcdefghijklmnopqrst.supabase.co/functions/v1/teacher-controls",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer provider-service-role-jwt",
        }),
      }),
    );
  });

  it("rejects a function boundary blocked before its handler", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      new Response(null, {
        status: String(url).endsWith("/teacher-controls") ? 401 : 405,
      })
    );

    await expect(probeFunctionBoundaries({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      anonKey: "provider-anon-key",
      serviceRoleKey: "provider-service-role-jwt",
      frontendOrigin: "https://school.example",
      fetcher,
    })).rejects.toThrow(/teacher-controls returned 401/i);
  });
});
