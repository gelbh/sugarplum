import { HTTPException } from "hono/http-exception";

export const VIEW_AS_READ_ONLY_CODE = "VIEW_AS_READ_ONLY";
export const VIEW_AS_READ_ONLY_MESSAGE = "Read-only while viewing as user";
export const VIEW_AS_READ_ONLY_TYPE =
  "https://sugarplum.gelbhart.dev/problems/view-as-read-only";

export function throwViewAsReadOnly(): never {
  throw new HTTPException(403, {
    message: VIEW_AS_READ_ONLY_MESSAGE,
    res: Response.json(
      {
        type: VIEW_AS_READ_ONLY_TYPE,
        title: VIEW_AS_READ_ONLY_MESSAGE,
        status: 403,
        detail: VIEW_AS_READ_ONLY_MESSAGE,
        code: VIEW_AS_READ_ONLY_CODE,
      },
      {
        status: 403,
        headers: { "Content-Type": "application/problem+json" },
      },
    ),
  });
}
