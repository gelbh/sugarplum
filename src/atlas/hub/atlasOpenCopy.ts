import { ApiError, VIEW_AS_READ_ONLY_CODE } from "../../api/client";

export { VIEW_AS_READ_ONLY_CODE };

export const VIEW_AS_ATLAS_EMPTY = "This user has no Parasitology Atlas yet.";

export function atlasOpenErrorMessage(err: unknown): string {
  if (
    err instanceof ApiError &&
    err.status === 403 &&
    err.code === VIEW_AS_READ_ONLY_CODE
  ) {
    return VIEW_AS_ATLAS_EMPTY;
  }
  if (err instanceof ApiError) return err.message;
  return "Could not open the Atlas";
}
