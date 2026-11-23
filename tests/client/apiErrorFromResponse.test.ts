import { describe, expect, it } from "vitest";
import {
  ApiError,
  VIEW_AS_READ_ONLY_CODE,
  throwApiErrorFromResponse,
} from "../../src/api/core";

function jsonResponse(
  status: number,
  body: unknown,
  statusText = "",
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

describe("throwApiErrorFromResponse", () => {
  it("ignores flat message for ApiError.message but keeps code", async () => {
    const res = jsonResponse(403, {
      message: "Read-only while viewing as user",
      code: VIEW_AS_READ_ONLY_CODE,
    });
    await expect(throwApiErrorFromResponse(res, "fallback")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: "fallback",
      code: VIEW_AS_READ_ONLY_CODE,
    });
  });

  it("parses problem+json detail + code", async () => {
    const res = jsonResponse(403, {
      type: "https://sugarplum.gelbhart.dev/problems/view-as-read-only",
      title: "Read-only while viewing as user",
      status: 403,
      detail: "Read-only while viewing as user",
      code: VIEW_AS_READ_ONLY_CODE,
    });
    await expect(throwApiErrorFromResponse(res, "fallback")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: "Read-only while viewing as user",
      code: VIEW_AS_READ_ONLY_CODE,
    });
  });

  it("uses title when detail is absent", async () => {
    const res = jsonResponse(400, {
      type: "https://sugarplum.gelbhart.dev/problems/http-exception",
      title: "Bad request title",
      status: 400,
    });
    await expect(throwApiErrorFromResponse(res, "fallback")).rejects.toMatchObject({
      status: 400,
      message: "Bad request title",
      code: undefined,
    });
  });

  it("ignores legacy flat error field for message", async () => {
    const res = jsonResponse(500, { error: "legacy boom" });
    await expect(throwApiErrorFromResponse(res, "fallback")).rejects.toMatchObject({
      status: 500,
      message: "fallback",
    });
  });

  it("falls back for non-JSON bodies", async () => {
    const res = new Response("not-json", { status: 502, statusText: "Bad Gateway" });
    try {
      await throwApiErrorFromResponse(res, "Request failed");
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ status: 502, message: "Bad Gateway" });
    }
  });
});
