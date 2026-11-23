import { describe, expect, it } from "vitest";
import {
  FOCUS_PACK_FINGERPRINT_VERSION,
  focusPackFingerprint,
} from "../../../worker/atlas/atlas-materials";
import { PARASITE_DATASET_VERSION } from "../../../worker/atlas/datasets/parasites/index";

const d = `d${PARASITE_DATASET_VERSION}`;

describe("focusPackFingerprint", () => {
  it("uses v5 and includes dataset version, id, content marker, and source_role", () => {
    expect(FOCUS_PACK_FINGERPRINT_VERSION).toBe("v5");
    const fp = focusPackFingerprint([
      {
        id: "m2",
        content_hash: "bbb",
        source_role: "practical",
      },
      {
        id: "m1",
        content_hash: "aaa",
        source_role: "tutorial",
      },
    ]);
    expect(fp).toBe(`v5:${d}:m1:aaa:tutorial|m2:bbb:practical`);
  });

  it("uses nochash sentinel when content_hash is null", () => {
    expect(
      focusPackFingerprint([
        { id: "m1", content_hash: null, source_role: "lecture" },
      ]),
    ).toBe(`v5:${d}:m1:nochash:lecture`);
  });

  it("changes when only source_role changes", () => {
    const base = {
      id: "m1",
      content_hash: "abc",
      source_role: "lecture" as const,
    };
    const a = focusPackFingerprint([base]);
    const b = focusPackFingerprint([{ ...base, source_role: "tutorial" }]);
    expect(a).not.toBe(b);
    expect(a).toBe(`v5:${d}:m1:abc:lecture`);
    expect(b).toBe(`v5:${d}:m1:abc:tutorial`);
  });

  it("changes when only the dataset version changes", () => {
    const rows = [{ id: "m1", content_hash: "abc", source_role: "lecture" }];
    expect(focusPackFingerprint(rows, 9)).not.toBe(
      focusPackFingerprint(rows, 10),
    );
  });
});
