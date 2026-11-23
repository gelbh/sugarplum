import { describe, expect, it } from "vitest";
import {
  mapApiErrorToUi,
  type ApiErrorUiHint,
} from "../../src/api/mapApiErrorToUi";

describe("mapApiErrorToUi", () => {
  it("returns fallback copy and inline for missing code", () => {
    expect(mapApiErrorToUi(undefined, "Request failed")).toEqual({
      copy: "Request failed",
      placement: "inline",
    });
  });

  it("returns fallback copy and inline for unknown code", () => {
    expect(mapApiErrorToUi("UNKNOWN_CODE", "Request failed")).toEqual({
      copy: "Request failed",
      placement: "inline",
    });
  });

  it("uses injected registry for known code", () => {
    const registry: Record<string, ApiErrorUiHint> = {
      DEMO_CODE: { copy: "Friendly copy", placement: "toast" },
    };
    expect(mapApiErrorToUi("DEMO_CODE", "Request failed", registry)).toEqual({
      copy: "Friendly copy",
      placement: "toast",
    });
  });

  it("ignores inherited prototype keys on the registry", () => {
    expect(mapApiErrorToUi("toString", "Request failed")).toEqual({
      copy: "Request failed",
      placement: "inline",
    });
    expect(mapApiErrorToUi("constructor", "Request failed")).toEqual({
      copy: "Request failed",
      placement: "inline",
    });
  });
});
