import { describe, expect, it, vi } from "vitest";
import { createNearAuthOptions } from "./near-auth";

function setup(hasPendingRecovery: (id: string) => Promise<boolean>) {
  const options = createNearAuthOptions({
    baseURL: "https://near.example",
    origin: "https://near.example",
    rpID: "near.example",
    secret: "test-only-secret-value-with-at-least-32-characters",
    database: {} as never,
    hasPasskey: async () => true,
    hasPendingRecovery,
  });
  const before = options.databaseHooks?.session?.create?.before;
  if (!before) throw new Error("Missing session guard");
  return before;
}

describe("recovery session guard", () => {
  it("denies passkey sign-in until the recovery reservation is consumed", async () => {
    const pending = vi.fn(async () => true);
    const before = setup(pending);
    await expect(
      before(
        { userId: "alice" } as never,
        { path: "/passkey/verify-authentication" } as never,
      ),
    ).rejects.toThrow();
    expect(pending).toHaveBeenCalledWith("alice");
  });
  it("allows normal passkey sign-in after recovery completes", async () => {
    const before = setup(async () => false);
    const result = await before(
      { userId: "alice" } as never,
      { path: "/passkey/verify-authentication" } as never,
    );
    expect(result && "data" in result && result.data.nearAuthMethod).toBe(
      "passkey",
    );
  });
  it("allows the recovery session to be created while a reservation exists", async () => {
    const before = setup(async () => true);
    const result = await before(
      { userId: "alice" } as never,
      { path: "/sign-in/email-otp" } as never,
    );
    expect(result && "data" in result && result.data.nearAuthMethod).toBe(
      "recovery",
    );
  });
});
