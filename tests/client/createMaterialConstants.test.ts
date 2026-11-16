import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPLOAD_MIMES,
  CREATE_NEW_DECK,
  CREATE_NEW_SUBJECT,
  FIGURES_SKIPPED_NOTICE,
  IMAGE_MIMES,
} from "../../src/materials/createMaterialConstants";

describe("createMaterialConstants", () => {
  it("allows pdf pptx and image mimes", () => {
    expect(IMAGE_MIMES.has("image/png")).toBe(true);
    expect(ALLOWED_UPLOAD_MIMES.has("application/pdf")).toBe(true);
    expect(ALLOWED_UPLOAD_MIMES.has("image/jpeg")).toBe(true);
  });

  it("keeps create-new sentinels and figures notice stable", () => {
    expect(CREATE_NEW_DECK).toBe("__create_new_deck__");
    expect(CREATE_NEW_SUBJECT).toBe("__create_new_subject__");
    expect(FIGURES_SKIPPED_NOTICE).toBe("Figure crops skipped for split uploads");
  });
});
