import JSZip from "jszip";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { buildApkg } from "../../worker/export/buildApkg";

describe("buildApkg", () => {
  it("builds an importable collection with basic, cloze, and MCQ notes", async () => {
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: {
            model: "basic",
            fields: { Front: "Question", Back: "Answer" },
            tags: ["qa"],
          },
          schedule: null,
          media: [],
        },
        {
          note: {
            model: "cloze",
            fields: { Text: "{{c1::mitochondria}}", Extra: "ATP" },
          },
          schedule: null,
          media: [],
        },
        {
          note: {
            model: "sugarplum_mcq",
            fields: { Front: "Pick one", Options: "A\nB", Answer: "B" },
          },
          schedule: null,
          media: [],
        },
      ],
    });

    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("collection.anki2")).not.toBeNull();
    const SQL = await initSqlJs();
    const db = new SQL.Database(
      await zip.file("collection.anki2")!.async("uint8array"),
    );
    expect(
      (db.exec("select count(*) as count from notes")[0]?.values[0]?.[0]),
    ).toBe(3);
    expect(
      (db.exec("select count(*) as count from cards")[0]?.values[0]?.[0]),
    ).toBe(3);
  });

  it("stores media files under numeric names and writes a media map", async () => {
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: {
            model: "basic",
            fields: { Front: '<img src="diagram.png">', Back: "Answer" },
          },
          schedule: null,
          media: [{ name: "diagram.png", data: new Uint8Array([137, 80, 78, 71]) }],
        },
      ],
    });

    const zip = await JSZip.loadAsync(bytes);
    expect(JSON.parse(await zip.file("media")!.async("string"))).toEqual({
      "0": "diagram.png",
    });
    expect(await zip.file("0")!.async("uint8array")).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    const SQL = await initSqlJs();
    const db = new SQL.Database(
      await zip.file("collection.anki2")!.async("uint8array"),
    );
    expect(db.exec("select flds from notes")[0]?.values[0]?.[0]).toContain(
      '<img src="0">',
    );
  });

  it("preserves learning card state and cloze ordinal", async () => {
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: {
            model: "basic",
            fields: { Front: "Learning", Back: "Answer" },
          },
          schedule: {
            due: 1_798_000_000,
            stability: 1,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 1,
            lapses: 0,
            state: 1,
            lastReview: null,
          },
          media: [],
        },
        {
          note: {
            model: "cloze",
            fields: { Text: "{{c2::x}}", Extra: "" },
          },
          schedule: null,
          media: [],
        },
      ],
    });
    const zip = await JSZip.loadAsync(bytes);
    const SQL = await initSqlJs();
    const db = new SQL.Database(
      await zip.file("collection.anki2")!.async("uint8array"),
    );
    expect(
      db.exec("select type, queue from cards order by nid limit 1")[0]?.values[0],
    ).toEqual([1, 1]);
    expect(
      db.exec("select ord from cards order by nid limit 1 offset 1")[0]?.values[0]?.[0],
    ).toBe(1);
  });
});
