import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import {
  imageExtForContentType,
  MAX_IMAGE_BYTES,
  parseAtlasImageCreateBody,
  parseAtlasImageUploadBody,
  parseAtlasRefBody,
} from "../../../worker/atlas/atlas-media-body";

describe("parseAtlasRefBody", () => {
  it("parses citation and optional fields", () => {
    expect(
      parseAtlasRefBody({
        citation: "  Bowen  ",
        field: " group ",
        url: " https://x ",
        note: " n ",
        materialId: "m1",
        page: 3,
      }),
    ).toEqual({
      fieldKey: "group",
      citation: "Bowen",
      url: "https://x",
      note: "n",
      materialId: "m1",
      page: 3,
    });
  });

  it("requires citation", () => {
    try {
      parseAtlasRefBody({ citation: "  " });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe("citation required");
    }
  });
});

describe("parseAtlasImageUploadBody", () => {
  it("accepts jpeg with size", () => {
    expect(
      parseAtlasImageUploadBody({ contentType: "image/jpeg", size: 100 }),
    ).toEqual({ contentType: "image/jpeg", size: 100 });
  });

  it("rejects bad mime", () => {
    try {
      parseAtlasImageUploadBody({ contentType: "image/gif", size: 1 });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe(
        "Only jpeg/png/webp uploads are allowed",
      );
    }
  });

  it("rejects invalid size", () => {
    try {
      parseAtlasImageUploadBody({ contentType: "image/png", size: 0 });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe("Valid size required");
    }
  });

  it("rejects oversized images", () => {
    try {
      parseAtlasImageUploadBody({
        contentType: "image/png",
        size: MAX_IMAGE_BYTES + 1,
      });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe(
        "Image must be 10MB or smaller",
      );
    }
  });
});

describe("imageExtForContentType", () => {
  it("maps mime to extension", () => {
    expect(imageExtForContentType("image/png")).toBe("png");
    expect(imageExtForContentType("image/webp")).toBe("webp");
    expect(imageExtForContentType("image/jpeg")).toBe("jpg");
  });
});

describe("parseAtlasImageCreateBody", () => {
  it("parses create payload", () => {
    expect(
      parseAtlasImageCreateBody({
        src: " /x.webp ",
        role: "adult",
        caption: " c ",
        isHero: true,
      }),
    ).toEqual({
      src: "/x.webp",
      role: "adult",
      caption: "c",
      credit: null,
      license: null,
      sourceUrl: null,
      isHero: true,
    });
  });

  it("requires src", () => {
    try {
      parseAtlasImageCreateBody({ role: "adult" });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe("src required");
    }
  });

  it("requires valid role", () => {
    try {
      parseAtlasImageCreateBody({ src: "x", role: "nope" });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe("Valid role required");
    }
  });
});
