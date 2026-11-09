import { describe, expect, it, vi } from "vitest";
import {
  completePasskeyRecovery,
  isRecentAuth,
  mayIssueAuthorization,
  mayRegisterPasskey,
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

describe("passkey registration authorization", () => {
  it("allows a fresh account or a recently verified recovery, never email-only recovery", () => {
    const now = Date.parse("2026-01-01T00:10:00Z");
    const fresh = new Date(now - 1000);
    expect(mayRegisterPasskey("bootstrap", fresh, false, now)).toBe(true);
    expect(mayRegisterPasskey("recovery", fresh, false, now)).toBe(false);
    expect(mayRegisterPasskey("recovery", fresh, true, now)).toBe(false);
    expect(mayRegisterPasskey("recovery_verified", fresh, true, now)).toBe(
      true,
    );
    expect(
      mayRegisterPasskey(
        "recovery_verified",
        new Date(now - 300001),
        false,
        now,
      ),
    ).toBe(false);
    expect(mayRegisterPasskey("recovery_complete", fresh, false, now)).toBe(
      false,
    );
    expect(mayRegisterPasskey("passkey", fresh, true, now)).toBe(false);
  });
});

describe("passkey recovery", () => {
  it("keeps existing passkeys when registration fails or belongs to another user", async () => {
    const revoke = vi.fn();
    await completePasskeyRecovery(
      "recovery_verified",
      "alice",
      null,
      "session",
      revoke,
    );
    await completePasskeyRecovery(
      "recovery_verified",
      "alice",
      { id: "new", userId: "bob" },
      "session",
      revoke,
    );
    await completePasskeyRecovery(
      "passkey",
      "alice",
      { id: "new", userId: "alice" },
      "session",
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
      "session",
      revoke,
    );
    expect(revoke).toHaveBeenCalledExactlyOnceWith("alice", "new", "session");
  });
});
