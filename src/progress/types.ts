export type ProgressMode = "determinate" | "indeterminate";

export type ProgressSource = "client" | "job";

export type ProgressSnapshot = {
  id: string;
  label: string;
  mode: ProgressMode;
  /** 0–100; only meaningful when mode === "determinate" */
  percent: number;
  detail?: string;
  source: ProgressSource;
};
