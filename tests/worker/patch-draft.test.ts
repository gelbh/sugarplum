import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import type { CardRow } from "../../worker/cards/serialize";
import {
  isFacePatch,
  parsePatchDraftBody,
  resolveCardFacePatch,
} from "../../worker/cards/patch-draft";

function row(partial: Partial<CardRow> = {}): CardRow {
  return {
    id: "c1",
    deck_id: "d1",
    job_id: null,
    type: "qa",
    front_json: JSON.stringify("Front?"),
    back_json: JSON.stringify("Back"),
    media_r2_keys_json: null,
    provenance_json: null,
    status: "draft",
    created_at: "t0",
    updated_at: "t0",
    ...partial,
  };
}

describe("parsePatchDraftBody", () => {
  it("accepts front patch", () => {
    expect(parsePatchDraftBody({ front: "New?" }).front).toBe("New?");
  });

  it("rejects empty patch", () => {
    try {
      parsePatchDraftBody({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).message).toBe("No fields to update");
    }
  });
});

describe("isFacePatch", () => {
  it("is false for provenance-only", () => {
    expect(isFacePatch({ provenance_pages: [1] })).toBe(false);
  });

  it("is true when front present", () => {
    expect(isFacePatch({ front: "x" })).toBe(true);
  });
});

describe("resolveCardFacePatch", () => {
  it("updates qa faces", () => {
    const resolved = resolveCardFacePatch(row(), {
      front: "Q?",
      back: "A",
    });
    expect(resolved.type).toBe("qa");
    expect(JSON.parse(resolved.front_json)).toBe("Q?");
    expect(JSON.parse(resolved.back_json)).toBe("A");
  });

  it("rejects empty back for qa", () => {
    try {
      resolveCardFacePatch(row(), { back: "   " });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe("Back cannot be empty");
    }
  });

  it("rejects malformed occlusion", () => {
    try {
      resolveCardFacePatch(row({ type: "occlusion" }), {
        type: "occlusion",
        front: "nope",
      });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe(
        "Occlusion cards need structured front regions and back.answer",
      );
    }
  });
});
