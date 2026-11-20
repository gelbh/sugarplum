import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { ApiError } from "../../src/api/client";
import {
  errMessage,
  parseHostList,
  previewLifecycleFields,
} from "../../src/atlas/mutate/atlasMutateHelpers";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

describe("parseHostList", () => {
  it("trims and drops empties", () => {
    expect(parseHostList(" sheep, cattle , ,goat ")).toEqual([
      "sheep",
      "cattle",
      "goat",
    ]);
  });
});

describe("errMessage", () => {
  it("reads ApiError message", () => {
    expect(errMessage(new ApiError(400, "Nope"), "fallback")).toBe("Nope");
  });

  it("joins Zod issues", () => {
    try {
      z.object({ n: z.number() }).parse({ n: "x" });
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
      expect(errMessage(err, "fallback")).toMatch(/number/i);
    }
  });

  it("falls back for unknown errors", () => {
    expect(errMessage(new Error("x"), "fallback")).toBe("fallback");
  });
});

describe("previewLifecycleFields", () => {
  it("mirrors stages into fields and diagnosticStage", () => {
    const base = emptyParasiteFields();
    const stages = [
      {
        name: "egg",
        hostRole: "environment" as const,
        diagnostic: true,
      },
    ];
    const preview = previewLifecycleFields(base, stages);
    expect(preview.lifecycleStages).toEqual(stages);
    expect(preview.diagnosticStage).toBe("egg");
  });
});
