import { describe, it, expect } from "vitest";
import { decodeJwtPayload, isTokenExpired } from "../../../utils/jwt";

function createTestJwt(payload: Record<string, unknown>): string {
  const toB64 = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  return `${toB64({ alg: "HS256", typ: "JWT" })}.${toB64(payload)}.fake`;
}

describe("ClientLiveKit JWT Functions", () => {
  describe("decodeJwtPayload", () => {
    it("decodes valid JWT payload", () => {
      const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const token = createTestJwt({ exp, sub: "user123" });

      const payload = decodeJwtPayload(token);

      expect(payload).not.toBeNull();
      expect(payload!.exp).toBe(exp);
    });

    it("handles URL-safe base64 characters", () => {
      // Create payload with special characters that become + and /
      const exp = 1234567890;
      const token = createTestJwt({ exp, data: "test+value/here" });

      const payload = decodeJwtPayload(token);

      expect(payload).not.toBeNull();
      expect(payload!.exp).toBe(exp);
    });

    it("returns null for invalid JWT (not 3 parts)", () => {
      expect(decodeJwtPayload("not.valid")).toBeNull();
      expect(decodeJwtPayload("just.two")).toBeNull();
      expect(decodeJwtPayload("")).toBeNull();
      expect(decodeJwtPayload("no-dots")).toBeNull();
    });

    it("returns null for JWT with 4 parts", () => {
      expect(decodeJwtPayload("a.b.c.d")).toBeNull();
    });

    it("handles payload without exp claim", () => {
      const token = createTestJwt({ sub: "user123" }); // No exp

      const payload = decodeJwtPayload(token);

      expect(payload).not.toBeNull();
      expect(payload!.exp).toBeUndefined();
    });

    it("returns null for invalid base64 in payload", () => {
      expect(decodeJwtPayload("header.!!!invalid!!!.signature")).toBeNull();
    });

    it("decodes numeric exp correctly", () => {
      const exactExp = 1735401600; // 2024-12-28T12:00:00Z
      const token = createTestJwt({ exp: exactExp });

      const payload = decodeJwtPayload(token);

      expect(payload!.exp).toBe(exactExp);
    });
  });

  describe("isTokenExpired", () => {
    it("returns false for valid non-expired token", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const exp = nowSeconds + 3600; // Expires in 1 hour
      const token = createTestJwt({ exp });

      expect(isTokenExpired(token)).toBe(false);
    });

    it("returns true for expired token", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const exp = nowSeconds - 3600; // Expired 1 hour ago
      const token = createTestJwt({ exp });

      expect(isTokenExpired(token)).toBe(true);
    });

    it("returns true when within 30 second buffer of expiration", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const token = createTestJwt({ exp: nowSeconds + 20 });
      expect(isTokenExpired(token)).toBe(true);
    });

    it("returns false when just outside 30 second buffer", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const token = createTestJwt({ exp: nowSeconds + 35 });
      expect(isTokenExpired(token)).toBe(false);
    });

    it("returns false for token without exp claim", () => {
      const token = createTestJwt({ sub: "user123" });
      expect(isTokenExpired(token)).toBe(false);
    });

    it("returns false for invalid token", () => {
      expect(isTokenExpired("not.valid")).toBe(false);
      expect(isTokenExpired("")).toBe(false);
    });

    it("handles exact expiration boundary", () => {
      const nowMs = 1735401600000;
      const token = createTestJwt({ exp: 1735401600 });
      expect(isTokenExpired(token, nowMs)).toBe(true);
    });

    it("handles buffer boundary exactly", () => {
      const nowMs = 1735401600000;
      const exp = Math.floor((nowMs + 30000) / 1000);
      const token = createTestJwt({ exp });

      expect(isTokenExpired(token, nowMs)).toBe(true);
      expect(isTokenExpired(token, nowMs - 1)).toBe(false);
    });

    it("uses custom nowMs parameter", () => {
      const token = createTestJwt({ exp: 1000 });
      expect(isTokenExpired(token)).toBe(true);
      expect(isTokenExpired(token, 500000)).toBe(false);
    });
  });

  describe("real-world scenarios", () => {
    it("handles LiveKit-style token", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const token = createTestJwt({
        exp: nowSeconds + 86400,
        iss: "APIKeyID",
        sub: "user-id",
        video: { room: "test-room", roomJoin: true },
      });

      expect(decodeJwtPayload(token)!.exp).toBe(nowSeconds + 86400);
      expect(isTokenExpired(token)).toBe(false);
    });

    it("detects near-expiration token", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const token = createTestJwt({ exp: nowSeconds + 10, iss: "APIKeyID" });
      expect(isTokenExpired(token)).toBe(true);
    });

    it("handles token with additional claims", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const token = createTestJwt({
        exp: nowSeconds + 3600,
        iat: nowSeconds,
        nbf: nowSeconds,
        iss: "issuer",
        custom: { nested: { data: true } },
      });

      expect(decodeJwtPayload(token)!.exp).toBe(nowSeconds + 3600);
      expect(isTokenExpired(token)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles exp=0", () => {
      expect(isTokenExpired(createTestJwt({ exp: 0 }))).toBe(true);
    });

    it("handles far future exp", () => {
      expect(isTokenExpired(createTestJwt({ exp: 4102444800 }))).toBe(false);
    });

    it("handles exp as float", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const token = createTestJwt({ exp: nowSeconds + 3600.999 });
      expect(decodeJwtPayload(token)!.exp).toBeCloseTo(nowSeconds + 3600.999);
      expect(isTokenExpired(token)).toBe(false);
    });

    it("handles exp as string", () => {
      const token = createTestJwt({ exp: "not-a-number" });
      expect(typeof decodeJwtPayload(token)!.exp).toBe("string");
      expect(isTokenExpired(token)).toBe(false);
    });

    it("handles null exp", () => {
      expect(isTokenExpired(createTestJwt({ exp: null }))).toBe(false);
    });

    it("handles negative exp", () => {
      expect(isTokenExpired(createTestJwt({ exp: -1000 }))).toBe(true);
    });
  });

  describe("base64 edge cases", () => {
    it("handles payload with padding", () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      expect(decodeJwtPayload(createTestJwt({ exp, x: "a" }))!.exp).toBe(exp);
    });

    it("handles URL-safe base64", () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = createTestJwt({
        exp,
        data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      });
      expect(decodeJwtPayload(token)!.exp).toBe(exp);
    });
  });
});
