import { describe, expect, it } from "vitest";
import {
  FOCUS_PACK_FINGERPRINT_VERSION,
  focusPackFingerprint,
} from "../../../worker/atlas/atlas-materials";

describe("focusPackFingerprint", () => {
  it("uses v2 and includes id, content marker, and source_role", () => {
    expect(FOCUS_PACK_FINGERPRINT_VERSION).toBe("v2");
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
    expect(fp).toBe("v2:m1:aaa:tutorial|m2:bbb:practical");
  });

  it("uses nochash sentinel when content_hash is null", () => {
    expect(
      focusPackFingerprint([
        { id: "m1", content_hash: null, source_role: "lecture" },
      ]),
    ).toBe("v2:m1:nochash:lecture");
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
    expect(a).toBe("v2:m1:abc:lecture");
    expect(b).toBe("v2:m1:abc:tutorial");
  });
});
