import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import {
  parseUploadSize,
  parseUploadUrlRequest,
  putContentTypeForResolved,
} from "../../worker/materials/upload-request";
import { PPTX_CONTENT_TYPE } from "../../worker/materials/upload";

describe("upload-request helpers", () => {
  it("parseUploadSize rejects zero and oversize", () => {
    expect(() => parseUploadSize(0)).toThrow(HTTPException);
    expect(() => parseUploadSize(51 * 1024 * 1024)).toThrow(HTTPException);
    expect(parseUploadSize(12)).toBe(12);
  });

  it("parseUploadUrlRequest enforces allowKinds and pptx content-type", () => {
    const parsed = parseUploadUrlRequest(
      {
        filename: "Week2.pptx",
        contentType: PPTX_CONTENT_TYPE,
        size: 100,
        source_role: "tutorial",
      },
      {
        allowKinds: new Set(["pdf", "pptx"]),
        rejectMessage: "Only PDF or PPTX uploads are allowed",
      },
    );
    expect(parsed).toMatchObject({
      resolved: { kind: "pptx", ext: "pptx" },
      putContentType: PPTX_CONTENT_TYPE,
      sourceRole: "tutorial",
      filename: "Week2.pptx",
    });

    expect(() =>
      parseUploadUrlRequest(
        {
          filename: "pic.png",
          contentType: "image/png",
          size: 100,
        },
        {
          allowKinds: new Set(["pdf", "pptx"]),
          rejectMessage: "Only PDF or PPTX uploads are allowed",
        },
      ),
    ).toThrow(/Only PDF or PPTX/);
  });

  it("putContentTypeForResolved forces pptx mime", () => {
    expect(putContentTypeForResolved("pptx", "application/octet-stream")).toBe(
      PPTX_CONTENT_TYPE,
    );
    expect(putContentTypeForResolved("pdf", "application/pdf")).toBe(
      "application/pdf",
    );
  });
});
