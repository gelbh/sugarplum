import type { ProgressMode, ProgressSnapshot } from "./types";

export type ProgressRegistryLike = {
  upsert: (snapshot: ProgressSnapshot) => void;
  complete: (id: string) => void;
  fail: (id: string) => void;
};

export type TrackedRunContext = {
  /** Meaningful only when mode is determinate; no-ops after settle. */
  setPercent: (percent: number) => void;
};

export type RunTrackedOptions = {
  label: string;
  mode?: ProgressMode;
};

/**
 * Upsert → run → complete/fail (try/catch settle).
 * Never invents a percent for indeterminate ops.
 */
export async function runTracked<T>(
  registry: ProgressRegistryLike,
  id: string,
  fn: (ctx: TrackedRunContext) => Promise<T>,
  options: RunTrackedOptions,
): Promise<T> {
  const mode: ProgressMode = options.mode ?? "indeterminate";
  const { label } = options;
  const source = "client" as const;
  let settled = false;

  registry.upsert({
    id,
    label,
    mode,
    percent: 0,
    source,
  });

  const setPercent = (percent: number) => {
    if (settled || mode !== "determinate") return;
    registry.upsert({
      id,
      label,
      mode: "determinate",
      percent,
      source,
    });
  };

  try {
    const result = await fn({ setPercent });
    settled = true;
    registry.complete(id);
    return result;
  } catch (err) {
    settled = true;
    registry.fail(id);
    throw err;
  }
}
