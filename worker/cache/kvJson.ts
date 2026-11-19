export const ADMIN_OVERVIEW_CACHE_KEY = "cache:admin:overview:v1";
export const ADMIN_OVERVIEW_CACHE_TTL_SECONDS = 120;

export async function cacheGetJson<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  const raw = await kv.get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cachePutJson(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await kv.put(key, JSON.stringify(value), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
}
