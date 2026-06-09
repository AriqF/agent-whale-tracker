import { connectRedis, getRedis } from './client';

async function ensureRedis() {
  const existing = getRedis();
  if (existing?.isOpen) return existing;
  return connectRedis();
}

export async function getJson<T>(key: string): Promise<T | null> {
  const redis = await ensureRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error('[Redis] getJson failed:', key, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setJson<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<boolean> {
  const redis = await ensureRedis();
  if (!redis) return false;

  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(key, payload, { EX: ttlSeconds });
    } else {
      await redis.set(key, payload);
    }
    return true;
  } catch (err) {
    console.error('[Redis] setJson failed:', key, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function del(key: string): Promise<boolean> {
  const redis = await ensureRedis();
  if (!redis) return false;

  try {
    await redis.del(key);
    return true;
  } catch (err) {
    console.error('[Redis] del failed:', key, err instanceof Error ? err.message : err);
    return false;
  }
}
