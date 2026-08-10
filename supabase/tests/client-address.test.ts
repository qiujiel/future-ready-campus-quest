import { describe, expect, it } from "vitest";
import {
  TRUSTED_CLIENT_ADDRESS_UNAVAILABLE,
  trustedClientAddress,
} from "../functions/_shared/client-address";

describe("trusted client address", () => {
  it("ignores caller-controlled forwarding headers when the gateway header is absent", () => {
    const headers = new Headers({
      "x-real-ip": "198.51.100.10",
      "x-forwarded-for": "203.0.113.7, 192.0.2.9",
    });

    expect(trustedClientAddress(headers)).toBe(
      TRUSTED_CLIENT_ADDRESS_UNAVAILABLE,
    );
  });

  it("returns one fail-closed sentinel for absent or invalid gateway addresses", () => {
    expect(trustedClientAddress(new Headers())).toBe(
      TRUSTED_CLIENT_ADDRESS_UNAVAILABLE,
    );
    expect(trustedClientAddress(new Headers({
      "cf-connecting-ip": "203.0.113.7, 198.51.100.2",
    }))).toBe(TRUSTED_CLIENT_ADDRESS_UNAVAILABLE);
    expect(trustedClientAddress(new Headers({
      "cf-connecting-ip": "203.0.113.999",
    }))).toBe(TRUSTED_CLIENT_ADDRESS_UNAVAILABLE);
  });

  it("normalizes valid gateway IPv4 and IPv6 addresses", () => {
    expect(trustedClientAddress(new Headers({
      "cf-connecting-ip": " 203.0.113.7 ",
      "x-real-ip": "198.51.100.10",
      "x-forwarded-for": "192.0.2.9",
    }))).toBe("203.0.113.7");
    expect(trustedClientAddress(new Headers({
      "cf-connecting-ip": "2001:0DB8:0000:0000:0000:0000:0000:0001",
    }))).toBe("2001:db8::1");
  });
});
