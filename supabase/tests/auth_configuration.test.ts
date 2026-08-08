import { describe, expect, it } from "vitest";
import { selectSupabaseKeys } from "../functions/_shared/auth-configuration";
import { issueInitialStudentSession } from "../functions/_shared/session-core";

describe("Edge Function Supabase key selection", () => {
  it("prefers modern hosted keys over disabled legacy keys", () => {
    expect(selectSupabaseKeys({
      FRCQ_SUPABASE_PUBLISHABLE_KEY: "modern-publishable",
      FRCQ_SUPABASE_SECRET_KEY: "modern-secret",
      SUPABASE_ANON_KEY: "legacy-anon",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
    })).toEqual({
      publishableKey: "modern-publishable",
      secretKey: "modern-secret",
    });
  });

  it("keeps provider legacy keys only as a local-development fallback", () => {
    expect(selectSupabaseKeys({
      SUPABASE_ANON_KEY: "local-anon",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
    })).toEqual({
      publishableKey: "local-anon",
      secretKey: "local-service-role",
    });
  });

  it("fails closed when either public or privileged access is unavailable", () => {
    expect(() => selectSupabaseKeys({ FRCQ_SUPABASE_PUBLISHABLE_KEY: "public" }))
      .toThrow(/privileged/i);
    expect(() => selectSupabaseKeys({ FRCQ_SUPABASE_SECRET_KEY: "secret" }))
      .toThrow(/publishable/i);
  });
});

describe("initial synthetic student sessions", () => {
  it("exchanges a one-time magic-link hash without a password login", async () => {
    const generated: unknown[] = [];
    const verified: unknown[] = [];
    const admin = {
      auth: {
        admin: {
          async generateLink(input: unknown) {
            generated.push(input);
            return {
              data: { properties: { hashed_token: "one-time-hash" } },
              error: null,
            };
          },
        },
      },
    };
    const publicClient = {
      auth: {
        async verifyOtp(input: unknown) {
          verified.push(input);
          return {
            data: {
              session: {
                access_token: "student-access",
                refresh_token: "student-refresh",
              },
            },
            error: null,
          };
        },
      },
    };

    await expect(
      issueInitialStudentSession(
        admin,
        publicClient,
        "synthetic@students.invalid",
      ),
    ).resolves.toEqual({
      accessToken: "student-access",
      refreshToken: "student-refresh",
    });
    expect(generated).toEqual([{
      type: "magiclink",
      email: "synthetic@students.invalid",
    }]);
    expect(verified).toEqual([{
      token_hash: "one-time-hash",
      type: "email",
    }]);
  });
});
