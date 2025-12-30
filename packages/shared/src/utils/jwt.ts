/** JWT parsing without signature verification. Used by ClientLiveKit for token expiration checks. */

// Base64 decode that works in both browser and Node.js
const base64Decode = (str: string): string => {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(str);
  }
  return Buffer.from(str, "base64").toString("utf-8");
};

export function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  // URL-safe base64 to standard base64, then decode
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  try {
    return JSON.parse(base64Decode(payload)) as { exp?: number };
  } catch {
    return null; // Malformed base64 or JSON
  }
}

/** Returns true if token is expired or will expire within 30 seconds */
export function isTokenExpired(
  token: string,
  nowMs: number = Date.now(),
): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;

  const bufferMs = 30000;
  return nowMs >= payload.exp * 1000 - bufferMs;
}
