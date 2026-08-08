import { describe, expect, it } from "vitest";
import { createSyntheticLoadContent } from "../../scripts/load-test-fixture.mjs";

describe("synthetic live-load content", () => {
  it("creates an immutable 24-item, eight-concept non-production bank", () => {
    const content = createSyntheticLoadContent();

    expect(content.version).toBe("synthetic-live-load-v1");
    expect(content.items).toHaveLength(24);
    expect(new Set(content.items.map((item) => item.conceptId)).size).toBe(8);
    expect(content.items.filter((item) => item.form === "diagnostic")).toHaveLength(8);
    expect(content.items.filter((item) => item.form === "practice")).toHaveLength(8);
    expect(content.items.filter((item) => item.form === "final")).toHaveLength(8);
    expect(JSON.stringify(content)).toContain("Synthetic load-test");
    expect(JSON.stringify(content)).not.toMatch(/approved-blueprint|protected course content/i);
  });
});
