import { describe, expect, it } from "vitest";
import { matchSubject, parseClusters } from "../../../src/calendar/parse";

const vetWeek = [
  ...Array.from({ length: 4 }, () => ({ summary: "Lecture: GEP AB2" })),
  { summary: "Practical: GEP AB2 - Parasitology Practical 1" },
  { summary: "Practical: GEP AB2 - Parasitology Practical 2" },
  { summary: "Practical: GEP AB2 - Bacteriology 4" },
  { summary: "Tutorial: GEP AB2" },
  { summary: "Lecture: GEP AL2" },
  { summary: "Lecture: GEP AL2" },
  { summary: "Suture Workshop" },
  { summary: "Gym" },
  { summary: "VetPALs AB2" },
  { summary: "Lecture: GEP AB2", status: "cancelled" },
  { summary: "Lecture: GEP AB2", eventType: "focusTime" },
];

describe("parseClusters", () => {
  it("clusters the vet week and drops noise", () => {
    const clusters = parseClusters(vetWeek);
    const ab = clusters.find((c) => c.key === "gepab2");
    const al = clusters.find((c) => c.key === "gepal2");
    expect(ab).toMatchObject({ title: "GEP AB2" });
    expect(ab?.chips).toEqual(["Bacteriology", "Lecture", "Parasitology"]);
    expect(al).toMatchObject({ title: "GEP AL2", chips: ["Lecture"] });
    expect(clusters).toHaveLength(2);
  });

  it("clusters hyphenated codes and keeps one chip per name", () => {
    const clusters = parseClusters([
      { summary: "Lecture: GEP-AB2" },
      { summary: "Lecture: GEP-AB2" },
      { summary: "Lecture: GEP AB2 - Lecture 2" },
      { summary: "Practical: GEP AB2 - Parasitology Practical 1" },
      { summary: "Practical: GEP AB2 - parasitology Practical 2" },
      { summary: "Lecture: GEP AB2 \u2014 Graphs" },
    ]);
    const ab = clusters.find((c) => c.key === "gepab2");
    expect(ab?.chips).toEqual(["Graphs", "Lecture", "Parasitology"]);
    expect(parseClusters([{}, { summary: "Lecture: GEP AB2" }])).toEqual([]);
  });

  it("links an equal code and does not link a topic title", () => {
    const [ab] = parseClusters([
      { summary: "Lecture: GEP AB2" },
      { summary: "Lecture: GEP AB2" },
    ]);
    expect(
      matchSubject(ab, [{ id: "s1", title: "GEP AB2" }]),
    ).toEqual({ kind: "link", subjectId: "s1" });
    expect(
      matchSubject(ab, [{ id: "s2", title: "Parasitology" }]),
    ).toEqual({ kind: "create" });
    expect(
      matchSubject(ab, [{ id: "hy", title: "GEP-AB2" }]),
    ).toEqual({ kind: "link", subjectId: "hy" });
  });
});
