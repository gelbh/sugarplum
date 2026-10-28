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
            fields: { Front: "Question", Back: "Answer" },
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
  });
});
