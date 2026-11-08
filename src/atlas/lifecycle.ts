import type { DatasetFields } from "./types";

type Stage = DatasetFields["lifecycleStages"][number];
type Days = { min: number; max: number };
export type HostRole = NonNullable<Stage["hostRole"]>;

export type Lane = {
  key: string;
  role: HostRole | null;
  title: string;
  hosts: string[];
  more: number;
};

const ROLE_TITLES: Record<HostRole, string> = {
  definitive: "Definitive host",
  intermediate: "Intermediate host",
  paratenic: "Paratenic host",
  environment: "Environment",
};

const LANE_HOSTS_SHOWN = 3;

function roleHosts(fields: DatasetFields, role: HostRole): string[] {
  if (role === "definitive") return fields.definitiveHosts;
  if (role === "intermediate") return fields.intermediateHosts;
  if (role === "paratenic") return fields.paratenicHosts;
  return [];
}

const laneKey = (s: Stage) =>
  s.hostRole === null ? "unassigned" : `${s.hostRole}|${s.host ?? ""}`;

/** One lane per distinct (role, host) in first-appearance order; role-less stages share a final lane. */
export function buildLanes(fields: DatasetFields): Lane[] {
  const lanes = new Map<string, Lane>();
  for (const stage of fields.lifecycleStages) {
    const role = stage.hostRole;
    if (role === null) continue;
    const key = laneKey(stage);
    if (lanes.has(key)) continue;
    const all = stage.host ? [stage.host] : roleHosts(fields, role);
    lanes.set(key, {
      key,
      role,
      title: ROLE_TITLES[role],
      hosts: all.slice(0, LANE_HOSTS_SHOWN),
      more: Math.max(0, all.length - LANE_HOSTS_SHOWN),
    });
  }
  if (fields.lifecycleStages.some((s) => s.hostRole === null)) {
    lanes.set("unassigned", {
      key: "unassigned",
      role: null,
      title: "Unassigned",
      hosts: [],
      more: 0,
    });
  }
  return [...lanes.values()];
}

export function stageLanes(fields: DatasetFields, lanes: Lane[]): number[] {
  return fields.lifecycleStages.map((s) =>
    lanes.findIndex((l) => l.key === laneKey(s)),
  );
}

export type AxisTick = { day: number; label: string };
export type Axis = {
  unit: "days" | "weeks";
  endDay: number;
  ticks: AxisTick[];
};

const WEEK_AXIS_AFTER_DAYS = 56;
// Preferred steps first, so day axes land on whole weeks when they can.
const DAY_STEPS = [7, 14, 5, 10, 2, 1, 20, 28];
const WEEK_STEPS = [2, 4, 5, 1, 10, 13, 26, 52];

// The axis always runs past its last value, so the patent stretch after the PPP stays visible.
const intervals = (span: number, step: number) => Math.floor(span / step) + 1;

function pickStep(span: number, steps: number[]): number {
  const fit = steps.find((s) => {
    const n = intervals(span, s);
    return n >= 4 && n <= 6;
  });
  return fit ?? Math.max(1, Math.ceil(span / 5));
}

const weekDays = (week: number) => Math.round(week * 7);
const OPEN_WINDOW_DAYS = 28;

/** Day 0 is definitive-host infection; null when there is no PPP and no test window to draw. */
export function axis(fields: DatasetFields): Axis | null {
  const ends = fields.diagnosticTests
    .filter((t) => t.windowStartWeek !== null)
    // An open-ended window gets four weeks of room so it reads as ongoing, not a sliver.
    .map((t) =>
      t.windowEndWeek === null
        ? weekDays(t.windowStartWeek!) + OPEN_WINDOW_DAYS
        : weekDays(t.windowEndWeek),
    );
  if (fields.pppDays) ends.push(fields.pppDays.max);
  if (ends.length === 0) return null;
  const span = Math.max(1, ...ends);
  const unit = span > WEEK_AXIS_AFTER_DAYS ? "weeks" : "days";
  const perUnit = unit === "weeks" ? 7 : 1;
  const spanUnits = Math.ceil(span / perUnit);
  const step = pickStep(spanUnits, unit === "weeks" ? WEEK_STEPS : DAY_STEPS);
  const count = intervals(spanUnits, step);
  const ticks = Array.from({ length: count + 1 }, (_, i) => {
    const value = i * step;
    return {
      day: value * perUnit,
      label: String(value),
    };
  });
  return { unit, endDay: count * step * perUnit, ticks };
}

export type PppBracket = { endDay: number; label: string };

export function pppBracket(fields: DatasetFields): PppBracket | null {
  const ppp = fields.pppDays;
  if (!ppp) return null;
  const label =
    ppp.min === ppp.max
      ? `PPP ${ppp.min} days`
      : `PPP ${ppp.min} to ${ppp.max} days`;
  return { endDay: ppp.min, label };
}

const DAYS_LABEL_BELOW = 14;

/** The unit follows the upper bound, so 10 to 21 days reads "about 1 to 3 weeks". */
export function durationLabel(d: Days): string {
  const [unit, a, b] =
    d.max < DAYS_LABEL_BELOW
      ? (["day", d.min, d.max] as const)
      : ([
          "week",
          // A short minimum still reads as at least a week ("about 1 to 3 weeks").
          Math.max(d.min > 0 ? 1 : 0, Math.round(d.min / 7)),
          Math.round(d.max / 7),
        ] as const);
  const n = a === b ? `${a}` : `${a} to ${b}`;
  return `about ${n} ${unit}${b === 1 ? "" : "s"}`;
}

export type DetectableWindow = {
  name: string;
  sample: string | null;
  startDay: number;
  endDay: number;
  openEnded: boolean;
};

export function detectableWindows(
  fields: DatasetFields,
  ax: Axis,
): DetectableWindow[] {
  return fields.diagnosticTests
    .filter((t) => t.windowStartWeek !== null)
    .map((t) => ({
      name: t.name,
      sample: t.sample,
      startDay: weekDays(t.windowStartWeek!),
      endDay: t.windowEndWeek === null ? ax.endDay : weekDays(t.windowEndWeek),
      openEnded: t.windowEndWeek === null,
    }));
}

export type DaySpan = { startDay: number; endDay: number };

/**
 * Stages carry no day positions, so a definitive-host stage stands for a stretch of the axis:
 * the last one is patent (PPP to axis end), the earlier ones share day 0 to PPP evenly.
 * Other stages happen before infection and light no window.
 */
export function stageSpan(
  fields: DatasetFields,
  index: number,
  ax: Axis,
): DaySpan | null {
  const ppp = fields.pppDays;
  if (!ppp || fields.lifecycleStages[index]?.hostRole !== "definitive")
    return null;
  const definitive = fields.lifecycleStages
    .map((s, i) => (s.hostRole === "definitive" ? i : -1))
    .filter((i) => i >= 0);
  const k = definitive.indexOf(index);
  if (definitive.length === 1) return { startDay: 0, endDay: ax.endDay };
  if (k === definitive.length - 1)
    return { startDay: ppp.min, endDay: ax.endDay };
  const width = ppp.min / (definitive.length - 1);
  return { startDay: k * width, endDay: (k + 1) * width };
}

export const windowLit = (w: DetectableWindow, span: DaySpan | null) =>
  span !== null && w.startDay < span.endDay && w.endDay > span.startDay;

export type LifecycleModel = {
  lanes: Lane[];
  stageLane: number[];
  axis: Axis | null;
  ppp: PppBracket | null;
  windows: DetectableWindow[];
  timed: boolean;
};

export function lifecycleModel(fields: DatasetFields): LifecycleModel {
  const lanes = buildLanes(fields);
  const ax = axis(fields);
  return {
    lanes,
    stageLane: stageLanes(fields, lanes),
    axis: ax,
    ppp: ax ? pppBracket(fields) : null,
    windows: ax ? detectableWindows(fields, ax) : [],
    timed: ax !== null,
  };
}
