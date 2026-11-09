import { describe, expect, it } from "vitest";
import { getProfileIcon, profileIcons } from "./profile-icon";

describe("profile icons", () => {
  it("returns the selected preset and safely falls back for unknown data", () => {
    expect(getProfileIcon("frog").symbol).toBe("🐸");
    expect(getProfileIcon("not-an-icon")).toEqual(profileIcons[0]);
    expect(getProfileIcon(undefined)).toEqual(profileIcons[0]);
  });
});
