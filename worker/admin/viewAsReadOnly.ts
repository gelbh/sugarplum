import { HTTPException } from "hono/http-exception";
import { problemJsonResponse } from "../http/problemJson";

export const VIEW_AS_READ_ONLY_CODE = "VIEW_AS_READ_ONLY";
export const VIEW_AS_READ_ONLY_MESSAGE = "Read-only while viewing as user";
export const VIEW_AS_READ_ONLY_TYPE =
  "https://sugarplum.gelbhart.dev/problems/view-as-read-only";

export function throwViewAsReadOnly(): never {
  throw new HTTPException(403, {
    message: VIEW_AS_READ_ONLY_MESSAGE,
    res: problemJsonResponse({
      status: 403,
      title: VIEW_AS_READ_ONLY_MESSAGE,
      detail: VIEW_AS_READ_ONLY_MESSAGE,
      code: VIEW_AS_READ_ONLY_CODE,
      slug: "view-as-read-only",
    }),
  });
}
