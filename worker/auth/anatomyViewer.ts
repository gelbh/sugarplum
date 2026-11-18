import { isAdminEmail, parseAdminEmails } from "../admin/allowlist";

/** Email-only gate (unlike admin: no Google-link requirement). */
export function isAnatomyViewerEnabled(
  email: string,
  raw: string | undefined,
): boolean {
  return isAdminEmail(email, parseAdminEmails(raw));
}
