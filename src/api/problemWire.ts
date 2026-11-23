/**
 * Shared API problem wire (RFC 9457 + legacy dual-read).
 * Imported by Worker emitters and the client parser.
 * Add new known codes to API_ERROR_CODES only.
 */
import { z } from "zod";

export const PROBLEM_TYPE_BASE = "https://sugarplum.gelbhart.dev/problems";

export function problemTypeUri(slug: string): string {
  return `${PROBLEM_TYPE_BASE}/${slug}`;
}

/** Known machine-readable codes. Extend here; unknown strings still parse. */
export const API_ERROR_CODES = {
  VIEW_AS_READ_ONLY: "VIEW_AS_READ_ONLY",
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export const VIEW_AS_READ_ONLY_CODE = API_ERROR_CODES.VIEW_AS_READ_ONLY;

/** Lenient fields: a mistyped member must not drop sibling `code` / message. */
const optStr = z.string().optional().catch(undefined);
const optNum = z.number().optional().catch(undefined);

const ApiErrorBodySchema = z
  .object({
    type: optStr,
    title: optStr,
    status: optNum,
    detail: optStr,
    code: optStr,
    message: optStr,
    error: optStr,
  })
  .passthrough();

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export type BuildProblemBodyOpts = {
  status: number;
  title: string;
  detail?: string;
  code?: string;
  slug: string;
  extensions?: Record<string, unknown>;
};

export type ProblemBody = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code?: string;
  [key: string]: unknown;
};

export function buildProblemBody(opts: BuildProblemBodyOpts): ProblemBody {
  const detail = opts.detail ?? opts.title;
  // Core RFC members win over extension keys with the same name.
  return {
    ...(opts.extensions ?? {}),
    type: problemTypeUri(opts.slug),
    title: opts.title,
    status: opts.status,
    detail,
    ...(opts.code ? { code: opts.code } : {}),
  };
}

export function parseApiErrorBody(data: unknown): ApiErrorBody | null {
  const result = ApiErrorBodySchema.safeParse(data);
  return result.success ? result.data : null;
}

export function messageFromApiErrorBody(
  data: ApiErrorBody,
  fallback: string,
): string {
  return data.detail ?? data.title ?? data.message ?? data.error ?? fallback;
}
