import { describe, expect, it } from "vitest";
import { friends, statusLabel } from "./demo";

describe("demo friend status", () => {
  it("distinguishes older locations from recent ones", () => {
    expect(statusLabel(friends[0]!)).toBe("共有中");
    expect(statusLabel(friends[2]!)).toBe("更新が古い");
  });
});
