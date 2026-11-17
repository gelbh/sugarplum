/** Sandbox R2 helpers: write prefix + Exit cleanup; skip deleting source read-through keys. */

export function sandboxR2Prefix(sandboxUserId: string): string {
  return `sandbox/${sandboxUserId}/`;
}

export function applySandboxKeyPrefix(
  sandboxUserId: string | null | undefined,
  key: string,
): string {
  if (!sandboxUserId) return key;
  const prefix = sandboxR2Prefix(sandboxUserId);
  if (key.startsWith(prefix)) return key;
  return `${prefix}${key}`;
}

/** Strip a leading `sandbox/{id}/` so figure matchers can use logical keys. */
export function stripSandboxKeyPrefix(key: string): string {
  const match = /^sandbox\/[^/]+\//.exec(key);
  return match ? key.slice(match[0].length) : key;
}

export function isSandboxWriteKey(
  sandboxUserId: string,
  key: string,
): boolean {
  return key.startsWith(sandboxR2Prefix(sandboxUserId));
}

/**
 * When the effective user is a sandbox (`sandbox_of` set), return that user id
 * for write-key prefixing; otherwise null (no prefix).
 */
export async function sandboxWriteUserId(
  db: D1Database,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT sandbox_of FROM users WHERE id = ?")
    .bind(userId)
    .first<{ sandbox_of: string | null }>();
  return row?.sandbox_of != null ? userId : null;
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

/** Delete every object under `sandbox/{sandboxUserId}/`. Never touch source keys. */
export async function deleteSandboxR2Prefix(
  bucket: R2Bucket,
  sandboxUserId: string,
): Promise<number> {
  const prefix = sandboxR2Prefix(sandboxUserId);
  let deleted = 0;
  let cursor: string | undefined;
  for (;;) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const obj of listed.objects) {
      await bucket.delete(obj.key);
      deleted += 1;
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return deleted;
}
