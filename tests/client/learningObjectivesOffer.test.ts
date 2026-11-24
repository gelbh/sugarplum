import { describe, expect, it } from "vitest";
import { DIY_OCCLUSION_FREE_PATH_NOTICE } from "../../src/deckHub/diy/openDiyOcclusion";
import {
  CREATE_FREE_PATH_IMAGE_NOTICE,
  createFreePathImageNotice,
  diyOcclusionNotice,
  FREE_PATH_IMAGE_HELPER,
  freePathImageHelperText,
  isImageUploadContentType,
  shouldOfferLearningObjectives,
  uploadSubmitDisabled,
  uploadSubmitLabel,
} from "../../src/materials/learningObjectivesOffer";
import {
  batchAllReused,
  storedUploadNotice,
} from "../../src/materials/storedUploadNotice";

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

  it("uses Continue only when BYO is confirmed missing", () => {
    expect(uploadSubmitLabel({ isImage: true, llmConfigured: false })).toBe(
      "Continue",
    );
    expect(uploadSubmitLabel({ isImage: true, llmConfigured: null })).toBe(
      "Start generation",
    );
    expect(uploadSubmitLabel({ isImage: true, llmConfigured: true })).toBe(
      "Start generation",
    );
    expect(uploadSubmitLabel({ isImage: false, llmConfigured: false })).toBe(
      "Start generation",
    );
  });

  it("disables image submit while settings are loading", () => {
    expect(
      uploadSubmitDisabled({
        isImage: true,
        llmConfigured: null,
        busy: false,
      }),
    ).toBe(true);
    expect(
      uploadSubmitDisabled({
        isImage: true,
        llmConfigured: false,
        busy: false,
      }),
    ).toBe(false);
  });

  it("shows free-path helper only when BYO confirmed missing", () => {
    expect(
      freePathImageHelperText({ isImage: true, llmConfigured: false }),
    ).toBe(FREE_PATH_IMAGE_HELPER);
    expect(
      freePathImageHelperText({ isImage: true, llmConfigured: null }),
    ).toBeNull();
    expect(
      freePathImageHelperText({ isImage: true, llmConfigured: true }),
    ).toBeNull();
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

  it("uses create-specific free-path notice without claiming DIY opened", () => {
    expect(createFreePathImageNotice({ hadLearningObjectives: false })).toBe(
      CREATE_FREE_PATH_IMAGE_NOTICE,
    );
    expect(
      createFreePathImageNotice({ hadLearningObjectives: true }).toLowerCase(),
    ).toContain("learning objectives");
    expect(CREATE_FREE_PATH_IMAGE_NOTICE.toLowerCase()).toContain("deck hub");
  });

  it("does not claim generation started when content-hash reused a prior job", () => {
    const notice = storedUploadNotice({
      status: "ready",
      jobId: "job-old",
      reused: true,
    });
    expect(notice.toLowerCase()).toContain("already");
    expect(notice.toLowerCase()).not.toContain("generation started");
  });

  it("keeps generation-started copy for a fresh job", () => {
    expect(
      storedUploadNotice({ status: "ready", jobId: "job-new", reused: false }),
    ).toBe("Stored file (ready). Generation started.");
  });

  it("treats mixed batches as not pure reuse", () => {
    expect(batchAllReused([{ reused: true }, { reused: false }])).toBe(false);
    expect(batchAllReused([{ reused: true }, { reused: true }])).toBe(true);
    expect(batchAllReused([])).toBe(false);
  });
});
