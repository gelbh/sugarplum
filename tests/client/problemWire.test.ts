import { describe, expect, it } from "vitest";
import {
  API_ERROR_CODES,
  VIEW_AS_READ_ONLY_CODE,
  buildProblemBody,
  messageFromApiErrorBody,
  parseApiErrorBody,
  problemTypeUri,
} from "../../src/api/problemWire";

describe("problemWire", () => {
  it("buildProblemBody sets type URI, status, and optional code", () => {
    const body = buildProblemBody({
      status: 403,
      title: "Read-only while viewing as user",
      slug: "view-as-read-only",
      code: API_ERROR_CODES.VIEW_AS_READ_ONLY,
    });
    expect(body).toEqual({
      type: problemTypeUri("view-as-read-only"),
      title: "Read-only while viewing as user",
      status: 403,
      detail: "Read-only while viewing as user",
      code: VIEW_AS_READ_ONLY_CODE,
    });
  });

  it("buildProblemBody spreads extensions", () => {
    const body = buildProblemBody({
      status: 400,
      title: "Export failed",
      slug: "export-business",
      extensions: { warnings: { missingMedia: 1, skippedCards: 0 } },
    });
    expect(body.warnings).toEqual({ missingMedia: 1, skippedCards: 0 });
    expect(body.code).toBeUndefined();
  });

  it("buildProblemBody core fields win over conflicting extensions", () => {
    const body = buildProblemBody({
      status: 403,
      title: "Real title",
      slug: "view-as-read-only",
      code: VIEW_AS_READ_ONLY_CODE,
      extensions: {
        type: "https://evil.example/x",
        title: "spoof",
        status: 200,
        detail: "spoof",
        code: "SPOOF",
      },
    });
    expect(body.type).toBe(problemTypeUri("view-as-read-only"));
    expect(body.title).toBe("Real title");
    expect(body.status).toBe(403);
    expect(body.detail).toBe("Real title");
    expect(body.code).toBe(VIEW_AS_READ_ONLY_CODE);
  });

  it("parseApiErrorBody accepts problem+json", () => {
    const parsed = parseApiErrorBody({
      type: problemTypeUri("view-as-read-only"),
      title: "Read-only while viewing as user",
      status: 403,
      detail: "Read-only while viewing as user",
      code: VIEW_AS_READ_ONLY_CODE,
    });
    expect(parsed?.code).toBe(VIEW_AS_READ_ONLY_CODE);
    expect(messageFromApiErrorBody(parsed!, "fb")).toBe(
      "Read-only while viewing as user",
    );
  });

  it("parseApiErrorBody accepts flat message + code", () => {
    const parsed = parseApiErrorBody({
      message: "Read-only while viewing as user",
      code: VIEW_AS_READ_ONLY_CODE,
    });
    expect(parsed?.code).toBe(VIEW_AS_READ_ONLY_CODE);
    expect(messageFromApiErrorBody(parsed!, "fb")).toBe(
      "Read-only while viewing as user",
    );
  });

  it("parseApiErrorBody accepts flat error field", () => {
    const parsed = parseApiErrorBody({ error: "legacy boom" });
    expect(messageFromApiErrorBody(parsed!, "fb")).toBe("legacy boom");
  });

  it("parseApiErrorBody keeps unknown code strings", () => {
    const parsed = parseApiErrorBody({
      detail: "x",
      code: "FUTURE_CODE",
      warnings: { missingMedia: 0 },
    });
    expect(parsed?.code).toBe("FUTURE_CODE");
    expect(parsed?.warnings).toEqual({ missingMedia: 0 });
  });

  it("parseApiErrorBody returns null for non-objects", () => {
    expect(parseApiErrorBody(null)).toBeNull();
    expect(parseApiErrorBody("nope")).toBeNull();
  });

  it("parseApiErrorBody keeps code when a sibling field is mistyped", () => {
    const parsed = parseApiErrorBody({
      code: VIEW_AS_READ_ONLY_CODE,
      error: { nested: true },
      status: "403",
    });
    expect(parsed?.code).toBe(VIEW_AS_READ_ONLY_CODE);
    expect(parsed?.status).toBeUndefined();
    expect(parsed?.error).toBeUndefined();
  });
});
