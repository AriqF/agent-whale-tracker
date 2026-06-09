import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connectAttempted = false;

export function getRedis(): RedisClientType | null {
  return client;
}

export async function connectRedis(): Promise<RedisClientType | null> {
  if (client?.isOpen) return client;
  if (connectAttempted && !client) return null;

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    console.warn('[Redis] REDIS_URL not set — running without Redis');
    connectAttempted = true;
    return null;
  }

  connectAttempted = true;
  try {
    const next = createClient({ url });
    next.on('error', (err) => console.error('[Redis] client error:', err.message));
    await next.connect();
    client = next as RedisClientType;
    console.log('[Redis] connected');
    return client;
  } catch (err) {
    console.error('[Redis] connect failed:', err instanceof Error ? err.message : err);
    client = null;
    return null;
  }
}

export async function pingRedis(): Promise<boolean> {
  const redis = await connectRedis();
  if (!redis) return false;
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
