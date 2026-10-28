import { describe, expect, it } from "vitest";
import {
  canGenerateMoreFromMaterial,
  isFigureMaterial,
  materialDisplayName,
} from "../../src/materials/materialActions";

describe("materialActions", () => {
  it("detects figure r2 keys", () => {
    expect(
      isFigureMaterial("materials/d/figures/pdf-1/0.png"),
    ).toBe(true);
    expect(isFigureMaterial("materials/d/m.txt")).toBe(false);
  });

  it("allows generate more only for ready paste/pdf", () => {
    expect(
      canGenerateMoreFromMaterial({ kind: "paste", status: "ready" }),
    ).toBe(true);
    expect(
      canGenerateMoreFromMaterial({ kind: "pdf", status: "ready" }),
    ).toBe(true);
    expect(
      canGenerateMoreFromMaterial({ kind: "image", status: "ready" }),
    ).toBe(false);
    expect(
      canGenerateMoreFromMaterial({ kind: "pdf", status: "uploading" }),
    ).toBe(false);
  });

  it("labels missing filename", () => {
    expect(materialDisplayName(null)).toBe("Untitled material");
    expect(materialDisplayName(" notes.pdf ")).toBe("notes.pdf");
  });
});
