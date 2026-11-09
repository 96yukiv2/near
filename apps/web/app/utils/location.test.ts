import { describe, expect, it } from "vitest";
import {
  formatLocationTime,
  isLocationStale,
  STALE_AFTER_MS,
} from "./location";

const now = Date.parse("2026-01-01T12:00:00Z");
describe("location freshness", () => {
  it("marks locations stale at 15 minutes, including the boundary", () => {
    expect(
      isLocationStale(new Date(now - STALE_AFTER_MS + 1).toISOString(), now),
    ).toBe(false);
    expect(
      isLocationStale(new Date(now - STALE_AFTER_MS).toISOString(), now),
    ).toBe(true);
  });
  it("does not present invalid or future timestamps as fresh", () => {
    expect(isLocationStale("invalid", now)).toBe(true);
    expect(isLocationStale(new Date(now + 1).toISOString(), now)).toBe(true);
    expect(formatLocationTime("invalid", now)).toBe("時刻を確認できません");
  });
  it("formats recent updates without exposing fabricated freshness", () => {
    expect(formatLocationTime(new Date(now - 30_000).toISOString(), now)).toBe(
      "たった今",
    );
    expect(
      formatLocationTime(new Date(now - 5 * 60_000).toISOString(), now),
    ).toBe("5分前");
    expect(
      formatLocationTime(new Date(now - 2 * 60 * 60_000).toISOString(), now),
    ).toBe("2時間前");
  });
});
