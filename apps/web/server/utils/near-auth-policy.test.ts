import { describe, expect, it } from "vitest";
import { isRecentAuth, mayIssueAuthorization } from "./near-auth-policy";

describe("authentication policy", () => {
  it("issues authorization only for a passkey-authenticated user with a credential", () => {
    expect(mayIssueAuthorization("passkey", true)).toBe(true);
    expect(mayIssueAuthorization("bootstrap", true)).toBe(false);
    expect(mayIssueAuthorization("recovery", true)).toBe(false);
    expect(mayIssueAuthorization("passkey", false)).toBe(false);
  });
  it("allows sensitive actions only after the correct recent authentication", () => {
    const now = Date.parse("2026-01-01T00:10:00Z");
    expect(
      isRecentAuth("passkey", new Date(now - 300_000), "passkey", now),
    ).toBe(true);
    expect(
      isRecentAuth("passkey", new Date(now - 300_001), "passkey", now),
    ).toBe(false);
    expect(isRecentAuth("recovery", new Date(now), "passkey", now)).toBe(false);
    expect(isRecentAuth("passkey", new Date(now + 1), "passkey", now)).toBe(
      false,
    );
    expect(isRecentAuth("passkey", "invalid", "passkey", now)).toBe(false);
  });
});
