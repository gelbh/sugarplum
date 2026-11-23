export type ApiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  /** RFC 9457 problem+json members (optional; dual-read with flat). */
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
};

/** Must match worker/admin/viewAsReadOnly.ts VIEW_AS_READ_ONLY_CODE. */
export const VIEW_AS_READ_ONLY_CODE = "VIEW_AS_READ_ONLY";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function guestUnsupported(action: string): never {
  throw new ApiError(403, `Guest mode is local-only. Sign in to ${action}.`);
}

export async function throwApiErrorFromResponse(
  res: Response,
  fallbackMessage: string,
): Promise<never> {
  let message = res.statusText || fallbackMessage;
  let code: string | undefined;
  try {
    const data = (await res.json()) as ApiErrorBody;
    message =
      data.detail ?? data.title ?? data.message ?? data.error ?? message;
    code = data.code;
  } catch {
    /* ignore non-JSON error bodies */
  }
  throw new ApiError(res.status, message, code);
}

/** JSON fetch helper; always sends cookies for session auth. */
export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    body,
    credentials: "include",
  });

  if (!res.ok) {
    await throwApiErrorFromResponse(res, "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
