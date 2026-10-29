export function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string, allow: Set<string>): boolean {
  return allow.has(email.trim().toLowerCase());
}

/** Same gate as requireAdmin: allowlisted email and Google-linked. */
export function isAdminUser(
  row: { email: string; oauth_subject: string | null },
  adminEmails: string | undefined,
): boolean {
  if (row.oauth_subject == null) return false;
  return isAdminEmail(row.email, parseAdminEmails(adminEmails));
}
