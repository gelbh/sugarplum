/**
 * UI-only API error presentation hints (copy + placement).
 * Not part of problemWire; do not import from Worker.
 * Default registry starts empty until a non-atlas surface needs an override.
 * Atlas empty-atlas copy stays a surface override (403 + VIEW_AS), not a registry row.
 */

export type ApiErrorPlacement = "inline" | "toast";

export type ApiErrorUiHint = {
  copy: string;
  placement: ApiErrorPlacement;
};

/** Known code → UI hint. Empty until a non-atlas surface needs an override. */
export const DEFAULT_API_ERROR_UI: Record<string, ApiErrorUiHint> = {};

export function mapApiErrorToUi(
  code: string | undefined,
  fallbackCopy: string,
  registry: Record<string, ApiErrorUiHint> = DEFAULT_API_ERROR_UI,
): ApiErrorUiHint {
  if (code !== undefined && Object.hasOwn(registry, code)) {
    return registry[code];
  }
  return { copy: fallbackCopy, placement: "inline" };
}
