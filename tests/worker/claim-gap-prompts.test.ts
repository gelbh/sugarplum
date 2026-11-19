import { describe, expect, it } from "vitest";
import {
  CLAIM_EXTRACT_SYSTEM_PROMPT,
  CLAIM_GAP_EXTRACT_SYSTEM_PROMPT,
  claimExtractUserPrompt,
  claimGapExtractUserPrompt,
} from "../../worker/generation/claim-prompts";

describe("claim gap extract prompts", () => {
  it("keeps 6–12 bias on the main extract prompts", () => {
    expect(CLAIM_EXTRACT_SYSTEM_PROMPT).toMatch(/6–12|6-12/);
    expect(claimExtractUserPrompt("sample")).toMatch(/6–12|6-12/);
  });

  it("omits 6–12 bias on the gap extract prompts", () => {
    expect(CLAIM_GAP_EXTRACT_SYSTEM_PROMPT).not.toMatch(/Prefer 6/);
    expect(CLAIM_GAP_EXTRACT_SYSTEM_PROMPT).not.toMatch(/6–12 solid/);
    const user = claimGapExtractUserPrompt([
      "Cells make ATP in the mitochondria.",
    ]);
    expect(user).toContain("Cells make ATP in the mitochondria.");
    expect(user).toMatch(/Do not limit yourself to 6/);
  });
});
