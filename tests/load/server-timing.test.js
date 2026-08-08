import { describe, expect, it } from "vitest";
import { parseJoinServerTiming } from "./server-timing.js";

describe("load-only join Server-Timing evidence", () => {
  it("parses only known numeric stage durations", () => {
    expect(parseJoinServerTiming(
      "find;dur=12.5, preflight;dur=42, unknown;dur=999, sign;dur=bad",
    )).toEqual({ find: 12.5, preflight: 42 });
  });

  it("returns no evidence when the header is absent", () => {
    expect(parseJoinServerTiming(null)).toEqual({});
  });
});
