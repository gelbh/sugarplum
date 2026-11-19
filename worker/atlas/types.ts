import type { Env } from "../env";
import type { AuthVariables } from "../auth/session";

export type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type AtlasRow = {
  id: string;
  user_id: string;
  template_key: string;
  created_at: string;
  focus_pack_fingerprint?: string | null;
};
