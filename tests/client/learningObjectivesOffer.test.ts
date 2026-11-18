import { describe, expect, it } from "vitest";
import { DIY_OCCLUSION_FREE_PATH_NOTICE } from "../../src/deckHub/openDiyOcclusion";
import {
  diyOcclusionNotice,
  FREE_PATH_IMAGE_HELPER,
  isImageUploadContentType,
  shouldOfferLearningObjectives,
  uploadSubmitLabel,
} from "../../src/lib/learningObjectivesOffer";

describe("learningObjectivesOffer", () => {
  it("recognizes jpeg png webp only", () => {
    expect(isImageUploadContentType("image/png")).toBe(true);
    expect(isImageUploadContentType("image/jpeg")).toBe(true);
    expect(isImageUploadContentType("image/webp")).toBe(true);
    expect(isImageUploadContentType("application/pdf")).toBe(false);
  });

  it("hides LO for free-path images including null configured", () => {
    expect(
      shouldOfferLearningObjectives({ isImage: true, llmConfigured: false }),
    ).toBe(false);
    expect(
      shouldOfferLearningObjectives({ isImage: true, llmConfigured: null }),
    ).toBe(false);
  });

  it("shows LO for BYO images and all non-images", () => {
    expect(
      shouldOfferLearningObjectives({ isImage: true, llmConfigured: true }),
    ).toBe(true);
    expect(
      shouldOfferLearningObjectives({ isImage: false, llmConfigured: false }),
    ).toBe(true);
  });

  it("uses Continue only for free-path images", () => {
    expect(uploadSubmitLabel({ isImage: true, llmConfigured: false })).toBe(
      "Continue",
    );
    expect(uploadSubmitLabel({ isImage: true, llmConfigured: true })).toBe(
      "Start generation",
    );
    expect(uploadSubmitLabel({ isImage: false, llmConfigured: false })).toBe(
      "Start generation",
    );
  });

  it("exposes free-path helper mentioning DIY and Settings", () => {
    expect(FREE_PATH_IMAGE_HELPER.toLowerCase()).toContain("occlusion");
    expect(FREE_PATH_IMAGE_HELPER.toLowerCase()).toMatch(/settings|api key|byo/);
  });

  it("appends ignored-LO sentence when objectives were typed", () => {
    const withLo = diyOcclusionNotice({ hadLearningObjectives: true });
    expect(withLo.startsWith(DIY_OCCLUSION_FREE_PATH_NOTICE)).toBe(true);
    expect(withLo.toLowerCase()).toContain("learning objectives");
    expect(withLo.toLowerCase()).toMatch(/not used|were not/);
    expect(diyOcclusionNotice({ hadLearningObjectives: false })).toBe(
      DIY_OCCLUSION_FREE_PATH_NOTICE,
    );
  });
});
