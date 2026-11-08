import { describe, expect, it, vi } from "vitest";
import { createDeleteAccountHandler } from "./handler";

const now = Date.parse("2026-01-01T12:00:00Z");
function token(
  options: { user?: string; ageSeconds?: number; method?: string } = {},
) {
  const payload = {
    sub: options.user ?? "a",
    session_id: "session",
    amr: [
      {
        method: options.method ?? "password",
        timestamp: now / 1000 - (options.ageSeconds ?? 0),
      },
    ],
  };
  return `header.${btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}.signature`;
}
function request(jwt?: string, body?: string) {
  return new Request("https://example.test/delete-account", {
    method: "POST",
    headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
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
    expect((await handler(request(token()))).status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });
  it("requires a recent authentication in this session, not a token refresh", async () => {
    const remove = vi.fn();
    const handler = createDeleteAccountHandler({
      getUser: async () => ({ id: "a" }),
      deleteUser: remove,
      now: () => now,
    });
    expect((await handler(request(token({ ageSeconds: 601 })))).status).toBe(
      403,
    );
    expect(
      (await handler(request(token({ method: "token_refresh" })))).status,
    ).toBe(403);
    expect((await handler(request(token({ user: "b" })))).status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });
  it("deletes only the authenticated account, ignoring a supplied target", async () => {
    const remove = vi.fn(async () => true);
    const handler = createDeleteAccountHandler({
      getUser: async () => ({ id: "a" }),
      deleteUser: remove,
      now: () => now,
    });
    expect(
      (await handler(request(token(), JSON.stringify({ id: "b" })))).status,
    ).toBe(200);
    expect(remove).toHaveBeenCalledWith("a");
  });
  it("reports failures rather than claiming the account was deleted", async () => {
    const handler = createDeleteAccountHandler({
      getUser: async () => ({ id: "a" }),
      deleteUser: async () => false,
      now: () => now,
    });
    expect((await handler(request(token()))).status).toBe(500);
  });
});
