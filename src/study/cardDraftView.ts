/** Card draft wire shapes. Kernel-safe; no api/client. */

export type OcclusionFrontView = {
  image_key: string;
  prompt?: string;
  regions: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
  }>;
  mode: "hide_one";
};

export type CardType =
  | "qa"
  | "cloze"
  | "image_label"
  | "diagram"
  | "mcq"
  | "occlusion";

export type CardDraftView = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: CardType | string;
  front: string | OcclusionFrontView;
  back: string | { answer: string };
  options?: string[];
  media_r2_keys?: string[];
  provenance: unknown;
  status: string;
  created_at: string;
  updated_at: string;
  due?: string;
  claim_id?: string | null;
};
