import { ApiError } from "../../api/client";

export const VIEW_AS_ATLAS_EMPTY =
  "This user has no Parasitology Atlas yet.";

export function atlasOpenErrorMessage(err: unknown): string {
  if (
    err instanceof ApiError &&
    err.status === 403 &&
    err.message === "Read-only while viewing as user"
  ) {
    return VIEW_AS_ATLAS_EMPTY;
  }
  if (err instanceof ApiError) return err.message;
  return "Could not open the Atlas";
}
