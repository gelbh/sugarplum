import {
  ApiError,
  VIEW_AS_READ_ONLY_CODE,
  mapApiErrorToUi,
} from "../../api/client";

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
  if (err instanceof ApiError) {
    return mapApiErrorToUi(err.code, err.message).copy;
  }
  return mapApiErrorToUi(undefined, "Could not open the Atlas").copy;
}
