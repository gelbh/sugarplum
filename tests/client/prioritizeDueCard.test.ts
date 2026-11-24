import { describe, expect, it } from "vitest";
import {
  cardIdFromSearch,
  prioritizeDueCard,
} from "../../src/study/queue/prioritizeDueCard";

type Row = { id: string };

const queue: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("prioritizeDueCard", () => {
  it("moves a matching id to the front and reports found", () => {
    const result = prioritizeDueCard(queue, "b");
    expect(result.found).toBe(true);
    expect(result.queue.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("leaves order unchanged when id is missing", () => {
    const result = prioritizeDueCard(queue, "missing");
    expect(result.found).toBe(false);
    expect(result.queue.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(result.queue).not.toBe(queue);
  });

  it("is a no-op for empty or blank card id", () => {
    expect(prioritizeDueCard(queue, "").found).toBe(false);
    expect(prioritizeDueCard(queue, "   ").found).toBe(false);
    expect(prioritizeDueCard(queue, null).found).toBe(false);
    expect(prioritizeDueCard(queue, undefined).found).toBe(false);
  });

  it("keeps already-first card first", () => {
    const result = prioritizeDueCard(queue, "a");
    expect(result.found).toBe(true);
    expect(result.queue.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("cardIdFromSearch", () => {
  it("reads card from query", () => {
    expect(cardIdFromSearch("?card=abc")).toBe("abc");
    expect(cardIdFromSearch("card=abc&x=1")).toBe("abc");
  });

  it("returns null when missing or blank", () => {
    expect(cardIdFromSearch("")).toBeNull();
    expect(cardIdFromSearch("?other=1")).toBeNull();
    expect(cardIdFromSearch("?card=%20")).toBeNull();
  });
});
