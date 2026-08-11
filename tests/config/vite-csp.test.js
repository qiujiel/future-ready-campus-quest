import { describe, expect, it } from "vitest";

import { contentSecurityPolicy } from "../../vite.config";

describe("development content security policy", () => {
  it("allows Vite's development-only inline stylesheet injection", () => {
    const policy = contentSecurityPolicy("http://127.0.0.1:54321", true);

    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("keeps inline styles blocked in production", () => {
    const policy = contentSecurityPolicy("https://example.supabase.co", false);

    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toContain("style-src 'self' 'unsafe-inline'");
  });
});
