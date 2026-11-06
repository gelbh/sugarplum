import { HTTPException } from "hono/http-exception";

export function parseOptionalJsonBody(raw: string): unknown | undefined {
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
}
