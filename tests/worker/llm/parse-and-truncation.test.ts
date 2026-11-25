import { describe, expect, it, vi } from "vitest";
import {
  isTruncationParseError,
  parseCardsPayload,
  withCompactTruncationRetry,
} from "../../../worker/generation/llm";
import { sampleCardsJson } from "./fixtures";

describe("parseCardsPayload", () => {
  it("accepts markdown-fenced JSON from Workers AI / GLM", () => {
    const fenced = "```json\n" + sampleCardsJson + "\n```";
    const drafts = parseCardsPayload(fenced);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]?.type).toBe("qa");
    expect(drafts[2]?.type).toBe("cloze");
  });

  it("accepts prose before a fenced JSON block", () => {
    const wrapped =
      "Sure, here are the cards:\n\n```json\n" + sampleCardsJson + "\n```\n";
    expect(parseCardsPayload(wrapped)).toHaveLength(3);
  });

  it("accepts raw JSON with leading/trailing chatter", () => {
    const wrapped =
      "Output:\n" + sampleCardsJson + "\nHope this helps!";
    expect(parseCardsPayload(wrapped)).toHaveLength(3);
  });

  it("still rejects content with no JSON object or array", () => {
    expect(() => parseCardsPayload("I cannot help with that.")).toThrow(
      /non-JSON/i,
    );
  });

  it("salvages complete cards when the model truncates mid-JSON", () => {
    const truncated =
      '{"cards":[' +
      JSON.stringify({
        type: "qa",
        front: "What defines monoxenous protozoa?",
        back: "A single host.",
        provenance: { pages: [1], excerpt: "monoxenous" },
      }) +
      ',{"type":"cloze","front":"Monoxenous protozoa are defined by having a {';
    const drafts = parseCardsPayload(truncated);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.type).toBe("qa");
  });

  it("names truncation when no complete card objects can be salvaged", () => {
    expect(() =>
      parseCardsPayload(
        '{"cards":[{"type":"cloze","front":"Monoxenous protozoa are defined by having a {}',
      ),
    ).toThrow(/truncated/i);
  });
});

describe("isTruncationParseError", () => {
  it("matches mid-JSON truncation errors only", () => {
    expect(
      isTruncationParseError(new Error("LLM response truncated mid-JSON")),
    ).toBe(true);
    expect(
      isTruncationParseError(
        new Error("LLM response truncated mid-JSON (preview: {) [len=12]"),
      ),
    ).toBe(true);
    expect(isTruncationParseError(new Error("LLM returned non-JSON content"))).toBe(
      false,
    );
    expect(isTruncationParseError("truncated mid-JSON")).toBe(false);
  });
});

describe("withCompactTruncationRetry", () => {
  it("returns first success without calling retry", async () => {
    const retry = vi.fn(async () => "retry");
    await expect(
      withCompactTruncationRetry(async () => "ok", retry),
    ).resolves.toBe("ok");
    expect(retry).not.toHaveBeenCalled();
  });

  it("retries once on truncation parse error", async () => {
    const first = vi.fn(async () => {
      throw new Error("LLM response truncated mid-JSON");
    });
    const retry = vi.fn(async () => "compact-ok");
    await expect(withCompactTruncationRetry(first, retry)).resolves.toBe(
      "compact-ok",
    );
    expect(first).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("does not retry non-truncation errors", async () => {
    const retry = vi.fn(async () => "retry");
    await expect(
      withCompactTruncationRetry(async () => {
        throw new Error("LLM returned non-JSON content");
      }, retry),
    ).rejects.toThrow(/non-JSON/i);
    expect(retry).not.toHaveBeenCalled();
  });
});
