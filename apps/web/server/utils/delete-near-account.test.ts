import { describe, expect, it, vi } from "vitest";
import {
  deleteNearAccount,
  type DeletionDependencies,
} from "./delete-near-account";

function setup() {
  let pending: string | null = null;
  const deps: DeletionDependencies = {
    findPending: vi.fn(async () => pending),
    startPending: vi.fn(async (_id, supabaseId) => (pending = supabaseId)),
    verifyIdentity: vi.fn(async (token, id) =>
      token === "valid" && id === "near-a" ? "supabase-a" : null,
    ),
    deleteSupabaseUser: vi.fn(async () => true),
    deleteBetterUser: vi.fn(async () => true),
  };
  return deps;
}

describe("linked account deletion", () => {
  it("deletes the verified linked accounts in order", async () => {
    const deps = setup();
    expect(await deleteNearAccount("near-a", "valid", deps)).toBe("deleted");
    expect(deps.verifyIdentity).toHaveBeenCalledWith("valid", "near-a");
    expect(deps.deleteSupabaseUser).toHaveBeenCalledExactlyOnceWith(
      "supabase-a",
    );
    expect(deps.deleteBetterUser).toHaveBeenCalledExactlyOnceWith("near-a");
    expect(
      vi.mocked(deps.deleteSupabaseUser).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(deps.deleteBetterUser).mock.invocationCallOrder[0]!,
    );
  });
  it("does not delete either user without a matching verified identity", async () => {
    const deps = setup();
    expect(await deleteNearAccount("near-a", "invalid", deps)).toBe(
      "unauthorized",
    );
    expect(deps.startPending).not.toHaveBeenCalled();
    expect(deps.deleteSupabaseUser).not.toHaveBeenCalled();
    expect(deps.deleteBetterUser).not.toHaveBeenCalled();
  });
  it("retains a job when Supabase fails and retries only the verified target", async () => {
    const deps = setup();
    vi.mocked(deps.deleteSupabaseUser).mockResolvedValueOnce(false);
    expect(await deleteNearAccount("near-a", "valid", deps)).toBe("retry");
    expect(deps.deleteBetterUser).not.toHaveBeenCalled();
    expect(await deleteNearAccount("near-a", "", deps)).toBe("deleted");
    expect(deps.deleteSupabaseUser).toHaveBeenLastCalledWith("supabase-a");
    expect(deps.deleteBetterUser).toHaveBeenCalledWith("near-a");
    expect(deps.verifyIdentity).toHaveBeenCalledTimes(1);
  });
  it("retains a job when Better Auth deletion fails and retries", async () => {
    const deps = setup();
    vi.mocked(deps.deleteBetterUser).mockRejectedValueOnce(
      new Error("unavailable"),
    );
    expect(await deleteNearAccount("near-a", "valid", deps)).toBe("retry");
    expect(await deleteNearAccount("near-a", "", deps)).toBe("deleted");
  });
  it("rejects a conflicting deletion job", async () => {
    const deps = setup();
    vi.mocked(deps.startPending).mockResolvedValueOnce("someone-else");
    expect(await deleteNearAccount("near-a", "valid", deps)).toBe(
      "unauthorized",
    );
    expect(deps.deleteSupabaseUser).not.toHaveBeenCalled();
  });
});
