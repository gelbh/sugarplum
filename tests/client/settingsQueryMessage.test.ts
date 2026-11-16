/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { settingsQueryMessage } from "../../src/settings/settingsQueryMessage";

describe("settingsQueryMessage", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("returns linked notice", () => {
    window.history.replaceState(null, "", "/settings?linked=1");
    expect(settingsQueryMessage()).toEqual({
      error: null,
      notice: "Google account linked.",
    });
  });

  it("returns oauth_conflict error", () => {
    window.history.replaceState(null, "", "/settings?error=oauth_conflict");
    expect(settingsQueryMessage()).toEqual({
      error: "That Google account is already linked to a different user.",
      notice: null,
    });
  });
});
