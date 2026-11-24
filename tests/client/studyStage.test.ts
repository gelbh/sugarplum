import { describe, expect, it } from "vitest";
import { studyStage } from "../../src/study/session/studyStage";

describe("studyStage", () => {
  it("is true for desktop fullscreen even without a card", () => {
    expect(
      studyStage({ mobile: false, hasCard: false, fullscreenZen: true }),
    ).toBe(true);
  });

  it("is true for mobile only while a card is on screen", () => {
    expect(
      studyStage({ mobile: true, hasCard: true, fullscreenZen: false }),
    ).toBe(true);
    expect(
      studyStage({ mobile: true, hasCard: false, fullscreenZen: false }),
    ).toBe(false);
  });

  it("is false for desktop without fullscreen", () => {
    expect(
      studyStage({ mobile: false, hasCard: true, fullscreenZen: false }),
    ).toBe(false);
  });

  it("stays true on mobile without a card if fullscreen is still on", () => {
    // Callers must exit FS when the mobile queue empties (useStudyImmersion).
    expect(
      studyStage({ mobile: true, hasCard: false, fullscreenZen: true }),
    ).toBe(true);
  });
});
