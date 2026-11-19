import { describe, expect, it } from "vitest";
import { HOME_BRAND, homePlainText } from "../../src/home/homeCopy";

describe("homepage copy", () => {
  it("names the brand and explains purpose", () => {
    const t = homePlainText();
    expect(HOME_BRAND).toBe("Sugarplum");
    expect(t).toMatch(/Sugarplum/);
    expect(t).toMatch(/spaced.?repetition/i);
    expect(t).toMatch(/flashcard/i);
    expect(t).not.toMatch(/advertising/i);
  });
});
