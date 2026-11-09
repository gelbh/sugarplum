import { describe, expect, it } from "vitest";
import {
  emptyParasiteFields,
  PARASITE_FIELD_KEYS,
  parasiteFieldsSchema,
} from "../../../worker/atlas/templates/parasite";

describe("parasite template", () => {
  it("fills every missing field with null or an empty list", () => {
    const empty = emptyParasiteFields();
    expect(empty.family).toBeNull();
    expect(empty.definitiveHosts).toEqual([]);
    expect(empty.lifecycleStages).toEqual([]);
    expect(empty.pppDays).toBeNull();
    expect(Object.keys(empty)).toEqual(PARASITE_FIELD_KEYS);
  });

  it("lists the template fields in a fixed order", () => {
    expect(PARASITE_FIELD_KEYS).toEqual([
      "phylum",
      "order",
      "family",
      "group",
      "definitiveHosts",
      "intermediateHosts",
      "paratenicHosts",
      "vectorRole",
      "majorOrgan",
      "onHostStages",
      "distribution",
      "zoonotic",
      "significance",
      "lifecycleType",
      "pppDays",
      "lifecycleStages",
      "diagnosticStage",
      "diagnosticTests",
    ]);
  });

  it("parses a full Fasciola hepatica record and trims text", () => {
    const parsed = parasiteFieldsSchema.parse({
      phylum: " Platyhelminthes ",
      family: "Fasciolidae",
      group: "trematode",
      definitiveHosts: ["sheep", "cattle"],
      intermediateHosts: ["Galba truncatula"],
      majorOrgan: "Liver",
      zoonotic: "yes",
      lifecycleType: "indirect",
      pppDays: { min: 56, max: 84 },
      lifecycleStages: [
        { name: "egg", location: "faeces" },
        { name: "metacercaria", location: "herbage" },
      ],
      diagnosticTests: [
        {
          name: "Faecal sedimentation",
          sample: "faeces",
          windowStartWeek: 10,
          windowEndWeek: null,
        },
      ],
    });
    expect(parsed.phylum).toBe("Platyhelminthes");
    expect(parsed.lifecycleStages[1]).toEqual({
      name: "metacercaria",
      location: "herbage",
      hostRole: null,
      host: null,
      durationDays: null,
      infective: false,
      diagnostic: false,
      transmission: null,
      note: null,
      imageId: null,
    });
    expect(parsed.diagnosticTests[0].windowStartWeek).toBe(10);
    expect(parsed.diagnosticStage).toBeNull();
  });

  it("drops unknown keys", () => {
    const parsed = parasiteFieldsSchema.parse({
      family: "Taeniidae",
      colour: "white",
    });
    expect(parsed).not.toHaveProperty("colour");
  });

  it("rejects an unknown group or zoonotic value", () => {
    expect(() => parasiteFieldsSchema.parse({ group: "insect" })).toThrow();
    expect(() => parasiteFieldsSchema.parse({ zoonotic: "maybe" })).toThrow();
  });

  it("rejects a PPP range whose max is below its min", () => {
    expect(() =>
      parasiteFieldsSchema.parse({ pppDays: { min: 60, max: 25 } }),
    ).toThrow();
  });

  it("rejects a test window that ends before it starts", () => {
    expect(() =>
      parasiteFieldsSchema.parse({
        diagnosticTests: [
          { name: "Serum ELISA", windowStartWeek: 8, windowEndWeek: 6 },
        ],
      }),
    ).toThrow();
  });

  it("rejects empty strings instead of storing them", () => {
    expect(() => parasiteFieldsSchema.parse({ family: "  " })).toThrow();
  });
});
