import { describe, expect, it } from "vitest";
import {
  canCreateOcclusionFromMaterial,
  canGenerateMoreFromMaterial,
  isFigureMaterial,
  materialDisplayName,
} from "../../src/materials/materialActions";

describe("materialActions", () => {
  it("detects figure r2 keys", () => {
    expect(isFigureMaterial("materials/d/figures/pdf-1/0.png")).toBe(true);
    expect(isFigureMaterial("materials/d/m.txt")).toBe(false);
  });

  it("allows generate more only for ready paste/pdf", () => {
    expect(
      canGenerateMoreFromMaterial({ kind: "paste", status: "ready" }),
    ).toBe(true);
    expect(canGenerateMoreFromMaterial({ kind: "pdf", status: "ready" })).toBe(
      true,
    );
    expect(
      canGenerateMoreFromMaterial({ kind: "image", status: "ready" }),
    ).toBe(false);
    expect(
      canGenerateMoreFromMaterial({ kind: "pdf", status: "uploading" }),
    ).toBe(false);
  });

  it("allows DIY occlusion for ready non-figure images with an r2 key", () => {
    expect(
      canCreateOcclusionFromMaterial({
        kind: "image",
        status: "ready",
        r2_key: "materials/d/img.png",
      }),
    ).toBe(true);
    expect(
      canCreateOcclusionFromMaterial({
        kind: "image",
        status: "ready",
        r2_key: "materials/d/figures/pdf-1/0.png",
      }),
    ).toBe(false);
    expect(
      canCreateOcclusionFromMaterial({
        kind: "image",
        status: "uploading",
        r2_key: "materials/d/img.png",
      }),
    ).toBe(false);
    expect(
      canCreateOcclusionFromMaterial({
        kind: "pdf",
        status: "ready",
        r2_key: "materials/d/a.pdf",
      }),
    ).toBe(false);
  });

  it("labels missing filename", () => {
    expect(materialDisplayName(null)).toBe("Untitled material");
    expect(materialDisplayName(" notes.pdf ")).toBe("notes.pdf");
  });
});
