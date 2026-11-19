export type DraftReviewNotice = {
  message: string;
  tone: "success" | "reject" | "info" | "error";
  undoCardId?: string;
};

export type DraftReviewTracked = {
  begin: (label?: string) => void;
  end: (ok?: boolean) => void;
  update?: (patch: {
    label?: string;
    mode?: "determinate" | "indeterminate";
    percent?: number;
  }) => void;
};

export type DraftReviewEnqueueUnlocks = (unlocks: readonly unknown[]) => void;
