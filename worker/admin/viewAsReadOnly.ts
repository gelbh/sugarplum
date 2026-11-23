import { HTTPException } from "hono/http-exception";

export const VIEW_AS_READ_ONLY_CODE = "VIEW_AS_READ_ONLY";
export const VIEW_AS_READ_ONLY_MESSAGE = "Read-only while viewing as user";

export function throwViewAsReadOnly(): never {
  throw new HTTPException(403, {
    message: VIEW_AS_READ_ONLY_MESSAGE,
    res: Response.json({
      message: VIEW_AS_READ_ONLY_MESSAGE,
      code: VIEW_AS_READ_ONLY_CODE,
    }),
  });
}
