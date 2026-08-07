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

  it("probes deployed boundaries with the modern publishable key", async () => {
    const publicFunctions = new Set(["join-cohort", "recover-student"]);
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const name = String(url).split("/").at(-1) ?? "";
      return new Response(null, {
        status: publicFunctions.has(name) ? 405 : 401,
      });
    });

    await expect(probeFunctionBoundaries({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      publishableKey: "modern-publishable-key",
      frontendOrigin: "https://school.example",
      fetcher,
    })).resolves.toEqual({ edgeFunctionsReady: 10 });
    expect(fetcher).toHaveBeenCalledTimes(APPLICATION_FUNCTION_NAMES.length);
    expect(fetcher).toHaveBeenCalledWith(
      "https://abcdefghijklmnopqrst.supabase.co/functions/v1/teacher-controls",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "modern-publishable-key",
        }),
      }),
    );
    expect(fetcher.mock.calls.some(([, options]) =>
      "Authorization" in ((options?.headers ?? {}) as Record<string, string>)
    )).toBe(false);
  });

  it("accepts handler-level method rejection on authenticated routes", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 405 }));

    await expect(probeFunctionBoundaries({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      publishableKey: "modern-publishable-key",
      frontendOrigin: "https://school.example",
      fetcher,
    })).resolves.toEqual({ edgeFunctionsReady: 10 });
  });

  it("rejects a missing or incorrectly configured function boundary", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      new Response(null, {
        status: String(url).endsWith("/teacher-controls") ? 404 : 405,
      })
    );

    await expect(probeFunctionBoundaries({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      publishableKey: "modern-publishable-key",
      frontendOrigin: "https://school.example",
      fetcher,
    })).rejects.toThrow(/teacher-controls returned 404/i);
  });
});
