import { describe, expect, it } from "vitest";
import * as loadFixture from "../../scripts/load-test-fixture.mjs";

const { createSyntheticLoadContent } = loadFixture;

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

describe("30-student join payloads", () => {
  it("uses class scope, unique four-digit passcodes, and one leader request per group", () => {
    const groupCodes = ["GROUP001", "GROUP002", "GROUP003", "GROUP004", "GROUP005"];
    const payloads = loadFixture.buildLoadStudentJoinPayloads?.({
      classAccessId: "40000000-0000-4000-8000-000000000099",
      groupCodes,
      requestKey: (index) =>
        `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }) ?? [];

    expect(payloads).toHaveLength(30);
    expect(new Set(payloads.map((payload) => payload.passcode)).size).toBe(30);
    expect(payloads.every((payload) => /^\d{4}$/.test(payload.passcode))).toBe(true);
    expect(payloads.filter((payload) => payload.wantsLeader)).toHaveLength(5);
    for (let groupIndex = 0; groupIndex < groupCodes.length; groupIndex += 1) {
      const group = payloads.slice(groupIndex * 6, (groupIndex + 1) * 6);
      expect(group.map((payload) => payload.joinCode)).toEqual(
        Array(6).fill(groupCodes[groupIndex]),
      );
      expect(group.map((payload) => payload.wantsLeader)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
    }
    expect(
      payloads.every((payload) =>
        payload.classAccessId === "40000000-0000-4000-8000-000000000099"
      ),
    ).toBe(true);
  });
});
