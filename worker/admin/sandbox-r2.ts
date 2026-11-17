/** Sandbox R2 helpers. PR2: skip deleting source read-through keys. PR3: write prefix. */

export function sandboxR2Prefix(sandboxUserId: string): string {
  return `sandbox/${sandboxUserId}/`;
}

export function isSandboxWriteKey(
  sandboxUserId: string,
  key: string,
): boolean {
  return key.startsWith(sandboxR2Prefix(sandboxUserId));
}

/** When the effective user is a sandbox, only sandbox-prefixed keys may be deleted. */
export async function filterDeletableR2Keys(
  db: D1Database,
  userId: string,
  keys: Iterable<string>,
): Promise<string[]> {
  const row = await db
    .prepare("SELECT sandbox_of FROM users WHERE id = ?")
    .bind(userId)
    .first<{ sandbox_of: string | null }>();
  if (row?.sandbox_of == null) return [...keys].filter(Boolean);
  const prefix = sandboxR2Prefix(userId);
  return [...keys].filter((key) => key.startsWith(prefix));
}
