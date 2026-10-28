import JSZip from "jszip";
import initSqlJs from "sql.js";
import type { AnkiFsrsFields } from "./fsrsMap";
import type { AnkiNoteSpec } from "./notes";

type ApkgEntry = {
  note: AnkiNoteSpec;
  schedule: AnkiFsrsFields | null;
  media: Array<{ name: string; data: Uint8Array }>;
};

type Model = {
  id: number;
  name: string;
  type: number;
  flds: Array<{ name: string; ord: number }>;
  tmpls: Array<{ name: string; ord: number; qfmt: string; afmt: string }>;
};

const DAY_SECONDS = 86400;

function modelDefinition(
  id: number,
  model: AnkiNoteSpec["model"],
): Model {
  if (model === "cloze") {
    return {
      id,
      name: "Sugarplum Cloze",
      type: 1,
      flds: [
        { name: "Text", ord: 0 },
        { name: "Extra", ord: 1 },
      ],
      tmpls: [
        {
          name: "Cloze",
          ord: 0,
          qfmt: "{{cloze:Text}}",
          afmt: "{{cloze:Text}}<br>{{Extra}}",
        },
      ],
    };
  }
  if (model === "sugarplum_mcq") {
    return {
      id,
      name: "Sugarplum MCQ",
      type: 0,
      flds: [
        { name: "Front", ord: 0 },
        { name: "Options", ord: 1 },
        { name: "Answer", ord: 2 },
      ],
      tmpls: [
        {
          name: "MCQ",
          ord: 0,
          qfmt: "{{Front}}<br>{{Options}}",
          afmt: "{{FrontSide}}<hr id=answer>{{Answer}}",
        },
      ],
    };
  }
  return {
    id,
    name: "Sugarplum Basic",
    type: 0,
    flds: [
      { name: "Front", ord: 0 },
      { name: "Back", ord: 1 },
    ],
    tmpls: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Front}}",
        afmt: "{{FrontSide}}<hr id=answer>{{Back}}",
      },
    ],
  };
}

function fieldsForNote(note: AnkiNoteSpec): string[] {
  const names =
    note.model === "cloze"
      ? ["Text", "Extra"]
      : note.model === "sugarplum_mcq"
        ? ["Front", "Options", "Answer"]
        : ["Front", "Back"];
  return names.map((name) => note.fields[name] ?? "");
}

function collectionModel(model: Model, now: number): Record<string, unknown> {
  return {
    id: model.id,
    name: model.name,
    type: model.type,
    mod: now,
    usn: 0,
    sortf: 0,
    did: 1,
    flds: model.flds.map((field) => ({
      name: field.name,
      ord: field.ord,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      media: [],
    })),
    tmpls: model.tmpls.map((template) => ({
      ...template,
      did: null,
      bqfmt: "",
      bafmt: "",
    })),
    css: ".card { font-family: arial; font-size: 20px; text-align: center; }",
    latexPre: "\\documentclass[12pt]{article}\n\\begin{document}\n",
    latexPost: "\\end{document}",
    req:
      model.type === 1
        ? [[0, "any", [0]]]
        : [[0, "any", [0]]],
    tags: [],
  };
}

function escapeMediaName(name: string): string {
  return name.replaceAll('"', "&quot;");
}

function unixSecondsToAnkiDue(due: number, crt: number, state: number): number {
  if (state === 1 || state === 3) return due;
  return Math.max(0, Math.floor((due - crt) / DAY_SECONDS));
}

export async function buildApkg(args: {
  deckName: string;
  entries: ApkgEntry[];
}): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const now = Math.floor(Date.now() / 1000);
  const deckId = now * 1000;
  const modelIds = {
    basic: deckId + 1,
    cloze: deckId + 2,
    sugarplum_mcq: deckId + 3,
  } as const;
  const models = {
    basic: modelDefinition(modelIds.basic, "basic"),
    cloze: modelDefinition(modelIds.cloze, "cloze"),
    sugarplum_mcq: modelDefinition(modelIds.sugarplum_mcq, "sugarplum_mcq"),
  } as const;
  const collectionModels = Object.fromEntries(
    Object.values(models).map((model) => [
      model.id,
      collectionModel(model, now),
    ]),
  );

  db.run(`
    CREATE TABLE col (
      id integer primary key, crt integer not null, mod integer not null,
      scm integer not null, ver integer not null, dty integer not null,
      usn integer not null, ls integer not null, conf text not null,
      models text not null, decks text not null, dconf text not null,
      tags text not null
    );
    CREATE TABLE notes (
      id integer primary key, guid text not null, mid integer not null,
      mod integer not null, usn integer not null, tags text not null,
      flds text not null, sfld integer not null, csum integer not null,
      flags integer not null, data text not null
    );
    CREATE TABLE cards (
      id integer primary key, nid integer not null, did integer not null,
      ord integer not null, mod integer not null, usn integer not null,
      type integer not null, queue integer not null, due integer not null,
      ivl integer not null, factor integer not null, reps integer not null,
      lapses integer not null, left integer not null, odue integer not null,
      odid integer not null, flags integer not null, data text not null
    );
    CREATE TABLE revlog (
      id integer primary key, cid integer not null, usn integer not null,
      ease integer not null, ivl integer not null, lastIvl integer not null,
      factor integer not null, time integer not null, type integer not null
    );
    CREATE TABLE graves (
      usn integer not null, oid integer not null, type integer not null
    );
  `);

  const decks = {
    1: {
      id: 1,
      name: "Default",
      desc: "",
      dyn: 0,
      conf: 1,
      extendNew: 10,
      extendRev: 50,
    },
    [deckId]: {
      id: deckId,
      name: args.deckName,
      desc: "",
      dyn: 0,
      conf: 1,
      extendNew: 10,
      extendRev: 50,
    },
  };
  const dconf = {
    1: {
      id: 1,
      name: "Default",
      new: { delays: [1, 10], ints: [1, 4], perDay: 20 },
      rev: { perDay: 200, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, ease4: 1.3 },
      lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8 },
    },
  };
  db.run(
    "INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      1,
      now,
      now,
      0,
      11,
      0,
      0,
      0,
      JSON.stringify({ nextPos: 1 }),
      JSON.stringify(collectionModels),
      JSON.stringify(decks),
      JSON.stringify(dconf),
      JSON.stringify([]),
    ],
  );

  const zip = new JSZip();
  const mediaMap: Record<string, string> = {};
  let mediaIndex = 0;
  const mediaNames = new Map<string, string>();
  for (const entry of args.entries) {
    for (const media of entry.media) {
      if (!mediaNames.has(media.name)) {
        const filename = String(mediaIndex++);
        mediaNames.set(media.name, filename);
        mediaMap[filename] = media.name;
        zip.file(filename, media.data);
      }
    }
  }

  args.entries.forEach((entry, index) => {
    const nid = now * 1_000_000 + index + 1;
    const cid = nid;
    const model = models[entry.note.model];
    const fields = fieldsForNote(entry.note);
    if (entry.note.model === "basic" && entry.media.length > 0) {
      const frontIndex = 0;
      if (!/<img\b/i.test(fields[frontIndex])) {
        fields[frontIndex] += entry.media
          .map((media) => `<img src="${escapeMediaName(mediaNames.get(media.name) ?? "")}">`)
          .join("");
      }
    }
    const flds = fields.join("\x1f");
    const tags = (entry.note.tags ?? []).join(" ");
    const schedule = entry.schedule;
    const state = schedule?.state ?? 0;
    const due = schedule
      ? unixSecondsToAnkiDue(schedule.due, now, state)
      : index;
    const data = schedule
      ? JSON.stringify({
          stability: schedule.stability,
          difficulty: schedule.difficulty,
          elapsedDays: schedule.elapsedDays,
          scheduledDays: schedule.scheduledDays,
          lastReview: schedule.lastReview,
        })
      : "{}";
    db.run(
      "INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [nid, `${nid}`, model.id, now, -1, tags, flds, fields[0].length, 0, 0, "{}"],
    );
    db.run(
      "INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        cid,
        nid,
        deckId,
        0,
        now,
        -1,
        schedule ? (state === 0 ? 0 : 2) : 0,
        schedule ? state : 0,
        due,
        schedule?.scheduledDays ?? 0,
        schedule ? Math.round(schedule.difficulty * 10) : 0,
        schedule?.reps ?? 0,
        schedule?.lapses ?? 0,
        0,
        0,
        0,
        0,
        data,
      ],
    );
  });

  zip.file("collection.anki2", db.export());
  zip.file("media", JSON.stringify(mediaMap));
  db.close();
  return zip.generateAsync({ type: "uint8array" });
}
