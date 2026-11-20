import type { Env } from "../env";
import type { AuthVariables } from "../auth/session";
import type { SourceRole } from "../../src/materials/sourceRole";

export type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  subject_hint: string | null;
  subject_id: string | null;
  created_at: string;
};

export type MaterialRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  content_hash?: string | null;
  source_role?: SourceRole;
};
