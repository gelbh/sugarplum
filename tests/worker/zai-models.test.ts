import { describe, expect, it } from "vitest";
import {
  ZAI_DEFAULT_TEXT_MODEL,
  ZAI_TEXT_MODEL_OPTIONS,
} from "../../src/settings/zaiModels";
import {
  ZAI_DEFAULT_TEXT_MODEL as SERVER_DEFAULT,
  ZAI_TEXT_MODELS,
} from "../../worker/generation/llm";

describe("zaiModels client allowlist", () => {
  it("mirrors server text model ids and default", () => {
    expect(ZAI_DEFAULT_TEXT_MODEL).toBe(SERVER_DEFAULT);
    expect(ZAI_TEXT_MODEL_OPTIONS.map((o) => o.value)).toEqual([
      ...ZAI_TEXT_MODELS,
    ]);
  });
});
