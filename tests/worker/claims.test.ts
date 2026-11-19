import { describe, expect, it } from "vitest";
import {
  filterClaimsAgainstChunk,
  matchClaimIdForDraft,
  parseClaimsPayload,
  pickClaimForRegen,
  studyClaimFromRow,
  type StoredClaim,
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

describe("matchClaimIdForDraft", () => {
  it("matches draft excerpt to claim source_span with normalized whitespace", () => {
    const claims: StoredClaim[] = [
      {
        id: "cl-1",
        subject: "Lysozyme",
        predicate: "digests peptidoglycan",
        source_span: "Lysozyme digests peptidoglycan",
      },
    ];
    expect(
      matchClaimIdForDraft(claims, "  Lysozyme   digests peptidoglycan "),
    ).toBe("cl-1");
    expect(matchClaimIdForDraft(claims, "unrelated")).toBeNull();
  });

  it("does not join on substring overlap of source_span", () => {
    const claims: StoredClaim[] = [
      {
        id: "cl-short",
        subject: "ATP",
        predicate: "is energy",
        source_span: "ATP",
      },
    ];
    expect(
      matchClaimIdForDraft(claims, "ATP is the primary energy currency"),
    ).toBeNull();
  });
});

describe("studyClaimFromRow", () => {
  it("maps row columns and parses optional JSON", () => {
    const claim = studyClaimFromRow({
      subject: "ATP",
      predicate: "stores energy",
      source_span: "ATP stores energy",
      object: "energy",
      qualifiers_json: JSON.stringify(["in cells"]),
      pages_json: JSON.stringify([1, 2]),
    });
    expect(claim).toEqual({
      subject: "ATP",
      predicate: "stores energy",
      source_span: "ATP stores energy",
      object: "energy",
      qualifiers: ["in cells"],
      pages: [1, 2],
    });
  });

  it("omits optional fields when JSON is invalid", () => {
    const claim = studyClaimFromRow({
      subject: "ATP",
      predicate: "stores energy",
      source_span: "ATP stores energy",
      object: null,
      qualifiers_json: "{not-json",
      pages_json: "nope",
    });
    expect(claim).toEqual({
      subject: "ATP",
      predicate: "stores energy",
      source_span: "ATP stores energy",
    });
  });
});
