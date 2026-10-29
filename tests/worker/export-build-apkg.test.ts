import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import JSZip from "jszip";
import initSqlJs from "sql.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildApkg,
  loadSqlWasmBinary,
} from "../../worker/export/buildApkg";

const require = createRequire(import.meta.url);

async function ankiSortFieldCsum(sortField: string): Promise<number> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(sortField),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const parsed = Number.parseInt(hex.slice(0, 8), 16);
  return parsed || 1;
}

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
      db.exec("select count(*) as count from notes")[0]?.values[0]?.[0],
    ).toBe(3);
    expect(
      db.exec("select count(*) as count from cards")[0]?.values[0]?.[0],
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
          media: [
            { name: "diagram.png", data: new Uint8Array([137, 80, 78, 71]) },
          ],
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
      '<img src="diagram.png">',
    );
  });

  it("keeps media with the same basename separate", async () => {
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: { model: "basic", fields: { Front: "A", Back: "A" } },
          schedule: null,
          media: [{ name: "deck-a/figure.png", data: new Uint8Array([1]) }],
        },
        {
          note: { model: "basic", fields: { Front: "B", Back: "B" } },
          schedule: null,
          media: [{ name: "deck-b/figure.png", data: new Uint8Array([2]) }],
        },
      ],
    });
    const zip = await JSZip.loadAsync(bytes);
    expect(JSON.parse(await zip.file("media")!.async("string"))).toEqual({
      "0": "figure.png",
      "1": "figure-1.png",
    });
    expect(await zip.file("0")!.async("uint8array")).toEqual(
      new Uint8Array([1]),
    );
    expect(await zip.file("1")!.async("uint8array")).toEqual(
      new Uint8Array([2]),
    );
  });

  it("stores Anki csum as decimal of first 8 SHA-1 hex digits of sort field", async () => {
    const sortField = "Question";
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: {
            model: "basic",
            fields: { Front: sortField, Back: "Answer" },
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
    expect(db.exec("select csum from notes")[0]?.values[0]?.[0]).toBe(
      await ankiSortFieldCsum(sortField),
    );
  });

  it("rewrites media sources in every note field including cloze Text", async () => {
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: {
            model: "cloze",
            fields: {
              Text: '<img src="photo.png">',
              Extra: "",
            },
          },
          schedule: null,
          media: [{ name: "photo.png", data: new Uint8Array([1, 2, 3]) }],
        },
      ],
    });
    const zip = await JSZip.loadAsync(bytes);
    const SQL = await initSqlJs();
    const db = new SQL.Database(
      await zip.file("collection.anki2")!.async("uint8array"),
    );
    expect(db.exec("select flds from notes")[0]?.values[0]?.[0]).toContain(
      '<img src="photo.png">',
    );
  });

  it("appends media not already present in a basic front", async () => {
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: {
            model: "basic",
            fields: { Front: '<img src="first.png">', Back: "Answer" },
          },
          schedule: null,
          media: [
            { name: "first.png", data: new Uint8Array([1]) },
            { name: "second.png", data: new Uint8Array([2]) },
          ],
        },
      ],
    });
    const zip = await JSZip.loadAsync(bytes);
    const SQL = await initSqlJs();
    const db = new SQL.Database(
      await zip.file("collection.anki2")!.async("uint8array"),
    );
    const fields = String(db.exec("select flds from notes")[0]?.values[0]?.[0]);
    expect(fields).toContain('<img src="first.png">');
    expect(fields).toContain('<img src="second.png">');
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
      db.exec("select type, queue from cards order by nid limit 1")[0]
        ?.values[0],
    ).toEqual([1, 1]);
    expect(
      db.exec("select ord from cards order by nid limit 1 offset 1")[0]
        ?.values[0]?.[0],
    ).toBe(1);
  });

  it("maps relearning state 3 to Anki queue 1", async () => {
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: {
            model: "basic",
            fields: { Front: "Relearning", Back: "Answer" },
          },
          schedule: {
            due: 1_798_000_000,
            stability: 1,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 1,
            reps: 1,
            lapses: 1,
            state: 3,
            lastReview: null,
          },
          media: [],
        },
      ],
    });
    const zip = await JSZip.loadAsync(bytes);
    const SQL = await initSqlJs();
    const db = new SQL.Database(
      await zip.file("collection.anki2")!.async("uint8array"),
    );
    expect(db.exec("select type, queue from cards")[0]?.values[0]).toEqual([
      3, 1,
    ]);
  });

  it("maps review due to days since crt and stores FSRS in cards.data", async () => {
    const dueUnix = Math.floor(Date.now() / 1000) + 14 * 86_400;
    const lastReview = Math.floor(Date.now() / 1000) - 86_400;
    const bytes = await buildApkg({
      deckName: "Sugarplum",
      entries: [
        {
          note: {
            model: "basic",
            fields: { Front: "Review", Back: "Answer" },
          },
          schedule: {
            due: dueUnix,
            stability: 12.34567,
            difficulty: 6.789,
            elapsedDays: 3,
            scheduledDays: 14,
            reps: 4,
            lapses: 1,
            state: 2,
            lastReview,
          },
          media: [],
        },
      ],
    });
    const zip = await JSZip.loadAsync(bytes);
    const SQL = await initSqlJs();
    const db = new SQL.Database(
      await zip.file("collection.anki2")!.async("uint8array"),
    );
    const crt = Number(db.exec("select crt from col")[0]?.values[0]?.[0]);
    const row = db.exec("select due, ivl, factor, data from cards")[0]
      ?.values[0];
    expect(row?.[0]).toBe(Math.floor((dueUnix - crt) / 86_400));
    expect(row?.[1]).toBe(14);
    expect(row?.[2]).toBe(2500);
    expect(JSON.parse(String(row?.[3]))).toEqual({
      s: 12.3457,
      d: 6.789,
      lrt: lastReview,
    });
  });
});

describe("loadSqlWasmBinary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads via ASSETS in Cloudflare Workers and never hits public APP_URL", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const wasmBytes = await readFile(
      require.resolve("sql.js/dist/sql-wasm.wasm"),
    );
    const fetchSpy = vi.fn(async () => {
      throw new Error("global fetch must not be used for sql.js WASM");
    });
    vi.stubGlobal("fetch", fetchSpy);
    let assetsPath = "";
    const assets = {
      fetch: async (input: RequestInfo | URL) => {
        assetsPath = String(input instanceof Request ? input.url : input);
        return new Response(wasmBytes, {
          status: 200,
          headers: { "content-type": "application/wasm" },
        });
      },
    };

    const loaded = await loadSqlWasmBinary({ assets });
    expect(loaded.byteLength).toBe(wasmBytes.byteLength);
    expect(assetsPath).toContain("sql-wasm");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when Worker runtime has no ASSETS binding", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    await expect(loadSqlWasmBinary({})).rejects.toThrow(/ASSETS binding/);
  });
});
