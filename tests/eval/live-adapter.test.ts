import { describe, expect, it } from "vitest";
import { textFromAiResult } from "./live-adapter";

describe("textFromAiResult", () => {
  it("reads chat completion content", () => {
    expect(
      textFromAiResult({ choices: [{ message: { content: "{\"cards\":[]}" } }] }),
    ).toBe("{\"cards\":[]}");
  });

  it("reads the older Workers AI response string when choices are absent", () => {
    expect(textFromAiResult({ response: "{\"cards\":[]}" })).toBe(
      "{\"cards\":[]}",
    );
  });

  it("returns empty when neither shape has text", () => {
    expect(textFromAiResult({ choices: [{ message: {} }] })).toBe("");
    expect(textFromAiResult(null)).toBe("");
  });
});
