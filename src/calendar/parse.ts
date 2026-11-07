export type CalendarEventIn = {
  summary?: string;
  status?: string;
  eventType?: string;
};

export type Cluster = {
  key: string;
  title: string;
  chips: string[];
  eventCount: number;
};

const KIND =
  /^(lecture|practical|tutorial|workshop|seminar|lab)\s*:\s*(.+)$/i;
const CODE = /^([A-Za-z]{2,8}(?:[\s-]+[A-Za-z]{1,6})?[\s-]*\d{1,4})\b/;
const DROP_TYPES = new Set([
  "birthday",
  "focusTime",
  "outOfOffice",
  "workingLocation",
  "fromGmail",
]);

export function clusterKey(code: string): string {
  return code.toLowerCase().replace(/[\s-]+/g, "");
}

type Hit = { key: string; display: string; kind: string; topic: string };

function kindLabel(kind: string): string {
  return kind[0].toUpperCase() + kind.slice(1);
}

function classify(event: CalendarEventIn): Hit | null {
  if (event.status === "cancelled") return null;
  if (event.eventType && DROP_TYPES.has(event.eventType)) return null;
  const summary = (event.summary ?? "").trim();
  if (!summary) return null;
  const kindMatch = KIND.exec(summary);
  if (!kindMatch) return null;
  const kind = kindMatch[1].toLowerCase();
  const codeMatch = CODE.exec(kindMatch[2].trim());
  if (!codeMatch) return null;
  const display = codeMatch[1];
  let topic = kindMatch[2].trim().slice(display.length).trim();
  topic = topic.replace(/^[-\u2013\u2014]\s*/, "");
  topic = topic.replace(
    /\s+(practical|lab|tutorial|lecture|seminar|workshop)\s*\d*\s*$/i,
    "",
  );
  topic = topic.replace(/\s+\d+\s*$/, "").trim();
  return { key: clusterKey(display), display, kind, topic };
}

export function parseClusters(events: CalendarEventIn[]): Cluster[] {
  const groups = new Map<string, Hit[]>();
  for (const event of events) {
    const hit = classify(event);
    if (!hit) continue;
    const list = groups.get(hit.key) ?? [];
    list.push(hit);
    groups.set(hit.key, list);
  }
  const clusters: Cluster[] = [];
  for (const [key, hits] of groups) {
    if (hits.length < 2) continue;
    const titles = new Map<string, number>();
    const topics = new Map<string, string>();
    const bareKinds = new Map<string, number>();
    for (const hit of hits) {
      titles.set(hit.display, (titles.get(hit.display) ?? 0) + 1);
      if (!hit.topic || hit.topic.toLowerCase() === hit.kind) {
        const label = kindLabel(hit.kind);
        bareKinds.set(label, (bareKinds.get(label) ?? 0) + 1);
      } else {
        const topicKey = hit.topic.toLowerCase();
        if (!topics.has(topicKey)) topics.set(topicKey, hit.topic);
      }
    }
    let title = hits[0].display;
    let best = 0;
    for (const [spelling, count] of titles) {
      if (count > best) {
        title = spelling;
        best = count;
      }
    }
    const seen = new Set<string>();
    const chips = [
      ...topics.values(),
      ...[...bareKinds.entries()].filter(([, n]) => n >= 2).map(([label]) => label),
    ]
      .sort((a, b) => a.localeCompare(b))
      .filter((chip) => {
        const chipKey = chip.toLowerCase();
        if (seen.has(chipKey)) return false;
        seen.add(chipKey);
        return true;
      });
    clusters.push({ key, title, chips, eventCount: hits.length });
  }
  clusters.sort((a, b) => a.key.localeCompare(b.key));
  return clusters;
}

export function matchSubject(
  cluster: Cluster,
  subjects: { id: string; title: string }[],
): { kind: "link"; subjectId: string } | { kind: "create" } {
  const found = subjects.find((s) => clusterKey(s.title) === cluster.key);
  if (found) return { kind: "link", subjectId: found.id };
  return { kind: "create" };
}
