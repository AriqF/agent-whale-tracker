import * as kv from '../redis/kv';
import type { MonitorFingerprint } from '../types';

const KEY_PREFIX = 'ocean-eyes:monitor:';

function monitorKey(coin: string): string {
  return `${KEY_PREFIX}${coin.toUpperCase()}`;
}

export async function loadMonitorState(coin: string): Promise<MonitorFingerprint | null> {
  return kv.getJson<MonitorFingerprint>(monitorKey(coin));
}

export async function saveMonitorState(coin: string, fp: MonitorFingerprint): Promise<void> {
  await kv.setJson(monitorKey(coin), fp);
}
