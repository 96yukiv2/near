import { describe, expect, it } from "vitest";
import { canSendBackgroundLocation } from "./location-policy";

describe("background location safety", () => {
  it("only sends recent positions for the account that enabled sharing", () => {
    expect(canSendBackgroundLocation("a", "a", 300000, 50, 300000)).toBe(true);
    expect(canSendBackgroundLocation("a", "b", 300000, 50, 300000)).toBe(false);
    expect(canSendBackgroundLocation(null, "a", 300000, 50, 300000)).toBe(
      false,
    );
    expect(canSendBackgroundLocation("a", "a", 0, 50, 300001)).toBe(false);
    expect(canSendBackgroundLocation("a", "a", 300000, null, 300000)).toBe(
      false,
    );
  });
});
