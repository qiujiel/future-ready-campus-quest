export const TRUSTED_CLIENT_ADDRESS_UNAVAILABLE =
  "trusted-client-address-unavailable";

function normalizeIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets.join(".");
}

function normalizeIpv6(value: string): string | null {
  if (!value.includes(":") || !/^[0-9a-f:.]+$/i.test(value)) return null;
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    if (!hostname.startsWith("[") || !hostname.endsWith("]")) return null;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

export function trustedClientAddress(headers: Headers): string {
  // Production Functions are reached through the Supabase/Cloudflare gateway,
  // which replaces this header. Browser-controlled forwarding headers are never
  // a trusted source; Task 8 carries this gateway assumption into runbooks.
  const value = headers.get("cf-connecting-ip")?.trim();
  if (!value) return TRUSTED_CLIENT_ADDRESS_UNAVAILABLE;
  return normalizeIpv4(value) ?? normalizeIpv6(value) ??
    TRUSTED_CLIENT_ADDRESS_UNAVAILABLE;
}
