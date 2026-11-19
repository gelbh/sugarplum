import { describe, expect, it } from "vitest";
import {
  filterClaimsAgainstChunk,
  parseClaimsPayload,
  pickClaimForRegen,
} from "../../worker/generation/claims";

describe("claims parse and filter", () => {
  it("parses claims wrapper and drops pronoun subjects", () => {
    const raw = JSON.stringify({
      claims: [
        {
          subject: "Lysozyme",
          predicate: "digests peptidoglycan in bacterial cell walls",
          object: "peptidoglycan",
          source_span: "Lysozyme digests peptidoglycan in bacterial cell walls",
        },
        {
          subject: "It",
          predicate: "is important",
          source_span: "It is important",
        },
      ],
    });
    const claims = filterClaimsAgainstChunk(
      parseClaimsPayload(raw),
      "Lysozyme digests peptidoglycan in bacterial cell walls. It is important.",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]!.subject).toBe("Lysozyme");
  });

  it("drops claims whose source_span is missing from the chunk", () => {
    const claims = filterClaimsAgainstChunk(
      [
        {
          subject: "ATP",
          predicate: "is invented",
          source_span: "totally absent span",
        },
      ],
      "ATP is adenosine triphosphate.",
    );
    expect(claims).toEqual([]);
  });

  it("salvages complete claim objects from truncated mid-array JSON", () => {
    const truncated = `{"claims":[{"subject":"Lysozyme","predicate":"digests peptidoglycan","source_span":"Lysozyme digests peptidoglycan"},{"subject":"ATP","predicate":"is energ`;
    const claims = parseClaimsPayload(truncated);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.subject).toBe("Lysozyme");
  });

  it("throws truncated mid-JSON when nothing can be salvaged", () => {
    const truncated = `{"claims":[{"subject":"Lysozyme","predicate":"digests`;
    expect(() => parseClaimsPayload(truncated)).toThrow(/truncated mid-JSON/i);
  });
});

describe("pickClaimForRegen", () => {
  const lysozyme = {
    subject: "Lysozyme",
    predicate: "digests peptidoglycan",
    source_span: "Lysozyme digests peptidoglycan",
  };
  const atp = {
    subject: "ATP",
    predicate: "stores energy",
    source_span: "ATP stores energy",
  };

  it("returns null for an empty claim list", () => {
    expect(pickClaimForRegen([])).toBeNull();
  });

  it("prefers a claim whose source_span matches the excerpt", () => {
    expect(
      pickClaimForRegen([lysozyme, atp], {
        excerpt: "ATP stores energy",
      }),
    ).toEqual(atp);
  });

  it("falls back to previous-front subject match when excerpt does not match", () => {
    expect(
      pickClaimForRegen([atp, lysozyme], {
        excerpt: "unrelated excerpt",
        previousFront: "What does Lysozyme digest?",
      }),
    ).toEqual(lysozyme);
  });

  it("returns the first claim when no excerpt or front match", () => {
    expect(pickClaimForRegen([lysozyme, atp])).toEqual(lysozyme);
  });
});
