import { describe, expect, it, vi } from "vitest";
import { createDeleteAccountHandler } from "./handler";

const now = Date.parse("2026-01-01T12:00:00Z");
function request(token?: string, body?: string) {
  return new Request("https://example.test/delete-account", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  });
}
describe("account deletion authorization", () => {
  it("rejects missing and invalid authentication without deleting", async () => {
    const remove = vi.fn();
    const handler = createDeleteAccountHandler({
      getUser: async () => null,
      deleteUser: remove,
      now: () => now,
    });
    expect((await handler(request())).status).toBe(401);
    expect((await handler(request("invalid"))).status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });
  it("requires a recent non-anonymous login", async () => {
    const remove = vi.fn();
    const handler = createDeleteAccountHandler({
      getUser: async () => ({
        id: "a",
        last_sign_in_at: new Date(now - 11 * 60_000).toISOString(),
      }),
      deleteUser: remove,
      now: () => now,
    });
    expect((await handler(request("valid"))).status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });
  it("deletes only the authenticated account, ignoring a supplied target", async () => {
    const remove = vi.fn(async () => true);
    const handler = createDeleteAccountHandler({
      getUser: async () => ({
        id: "a",
        last_sign_in_at: new Date(now).toISOString(),
      }),
      deleteUser: remove,
      now: () => now,
    });
    expect(
      (await handler(request("valid", JSON.stringify({ id: "b" })))).status,
    ).toBe(200);
    expect(remove).toHaveBeenCalledWith("a");
  });
  it("reports failures rather than claiming the account was deleted", async () => {
    const handler = createDeleteAccountHandler({
      getUser: async () => ({
        id: "a",
        last_sign_in_at: new Date(now).toISOString(),
      }),
      deleteUser: async () => false,
      now: () => now,
    });
    expect((await handler(request("valid"))).status).toBe(500);
  });
});
