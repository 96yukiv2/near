import { describe, expect, it, vi } from "vitest";
import {
  completePasskeyRecovery,
  isRecentAuth,
  mayIssueAuthorization,
} from "./near-auth-policy";

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

describe("passkey recovery", () => {
  it("keeps existing passkeys when registration fails or belongs to another user", async () => {
    const revoke = vi.fn();
    await completePasskeyRecovery("recovery_verified", "alice", null, revoke);
    await completePasskeyRecovery(
      "recovery_verified",
      "alice",
      { id: "new", userId: "bob" },
      revoke,
    );
    await completePasskeyRecovery(
      "passkey",
      "alice",
      { id: "new", userId: "alice" },
      revoke,
    );
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes only old passkeys after the new credential is saved", async () => {
    const revoke = vi.fn();
    await completePasskeyRecovery(
      "recovery_verified",
      "alice",
      { id: "new", userId: "alice" },
      revoke,
    );
    expect(revoke).toHaveBeenCalledExactlyOnceWith("alice", "new");
  });
});
