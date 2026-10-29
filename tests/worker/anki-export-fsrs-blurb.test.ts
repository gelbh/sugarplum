import { describe, expect, it } from "vitest";
import { ankiExportFsrsBlurb } from "../../src/settings/ankiExportFsrsBlurb";

describe("ankiExportFsrsBlurb", () => {
  it("documents FSRS floor and no review history", () => {
    const text = ankiExportFsrsBlurb();
    expect(text).toMatch(/FSRS/);
    expect(text).toMatch(/review history/i);
    expect(text).toMatch(/not exported/i);
  });
});
