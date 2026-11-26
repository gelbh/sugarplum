/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  glanceSections,
  splitGlanceForMobile,
} from "../../../../src/atlas/entry/entryGlance";
import { emptyParasiteFields } from "../../../../worker/atlas/templates/parasite";

describe("splitGlanceForMobile", () => {
  it("puts taxonomy+range in more; hosts/body/detection in primary", () => {
    const fields = emptyParasiteFields();
    fields.phylum = "Nematoda";
    fields.definitiveHosts = ["dog"];
    fields.majorOrgan = "intestine";
    fields.zoonotic = "yes";
    fields.distribution = "Worldwide";
    const sections = glanceSections(fields);
    const { primary, more } = splitGlanceForMobile(sections);
    expect(primary.map((s) => s.id)).toEqual(["hosts", "body", "detection"]);
    expect(more.map((s) => s.id)).toEqual(["taxonomy", "range"]);
  });

  it("omits empty buckets", () => {
    const fields = emptyParasiteFields();
    fields.definitiveHosts = ["cat"];
    const { primary, more } = splitGlanceForMobile(glanceSections(fields));
    expect(primary.map((s) => s.id)).toEqual(["hosts"]);
    expect(more).toEqual([]);
  });
});
