import { describe, expect, it, vi } from "vitest";
import {
  clearPendingInvite,
  getPendingInvite,
  savePendingInvite,
} from "./pending-invite";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("pending friend invitation", () => {
  it("keeps an invitation in the tab through sign-in and clears it after use", () => {
    const storage = memoryStorage();
    const token = "ab".repeat(32);
    expect(savePendingInvite(storage, token, 1000)).toBe(true);
    expect(getPendingInvite(storage, 2000)).toBe(token);
    clearPendingInvite(storage);
    expect(getPendingInvite(storage, 2000)).toBe("");
  });
  it("replaces a previous pending invitation with the latest valid one", () => {
    const storage = memoryStorage();
    const first = "ab".repeat(32);
    const second = "cd".repeat(32);
    savePendingInvite(storage, first, 1000);
    savePendingInvite(storage, second, 2000);
    expect(getPendingInvite(storage, 3000)).toBe(second);
  });
  it("rejects malformed or expired invitations and handles blocked storage", () => {
    const storage = memoryStorage();
    expect(savePendingInvite(storage, "bad", 0)).toBe(false);
    savePendingInvite(storage, "ab".repeat(32), 0);
    expect(getPendingInvite(storage, 24 * 60 * 60_000)).toBe("");
    const blocked = {
      getItem: vi.fn(() => {
        throw new Error();
      }),
      setItem: vi.fn(() => {
        throw new Error();
      }),
      removeItem: vi.fn(),
    };
    expect(savePendingInvite(blocked, "ab".repeat(32), 0)).toBe(false);
    expect(getPendingInvite(blocked, 0)).toBe("");
  });
});
