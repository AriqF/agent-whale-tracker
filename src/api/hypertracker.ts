import { getCache, setCache } from '../cache';
import type {
  BiasExportResponse,
  BiasExportWindow,
  CohortId,
  LeaderboardEntry,
  PositionAge,
  PositionMetricSnapshot,
  PositionMetricsResponse,
  PositionRecord,
  PositionsResponse,
} from '../types';
import {
  logApiCacheHit,
  logApiError,
  logApiNetworkError,
  logApiRequest,
  logApiSuccess,
} from '../utils/apiLogger';

const SERVICE = 'HyperTracker';
const BASE_URL = 'https://ht-api.coinmarketman.com';

export const WHALE_COHORT_IDS: CohortId[] = [7, 6, 5, 8, 9];

export const POSITIONS_DEFAULT_COHORT_IDS: CohortId[] = [7, 9];
export const POSITIONS_LIMIT = 25;
export const POSITIONS_LOOKBACK_DAYS = 3;
export const POSITIONS_CACHE_TTL = 600;

export const COHORT_META: Record<
  CohortId,
  { name: string; emoji: string }
> = {
  1: { name: 'Fish', emoji: '🐟' },
  2: { name: 'Dolphin', emoji: '🐬' },
  3: { name: 'Apex Predator', emoji: '🦈' },
  4: { name: 'Small Whale', emoji: '🐋' },
  5: { name: 'Whale', emoji: '🐳' },
  6: { name: 'Tidal Whale', emoji: '🌊' },
  7: { name: 'Leviathan', emoji: '🐉' },
  8: { name: 'Money Printer', emoji: '💰' },
  9: { name: 'Smart Money', emoji: '📈' },
  10: { name: 'Consistent Grinder', emoji: '📊' },
  11: { name: 'Humble Earner', emoji: '🙏' },
  12: { name: 'Exit Liquidity', emoji: '🤡' },
  13: { name: 'Semi-Rekt', emoji: '🔥' },
  14: { name: 'Full Rekt', emoji: '🚨' },
  15: { name: 'Giga Rekt', emoji: '💀' },
  16: { name: 'Shrimp', emoji: '🦐' },
};

function headers(): Record<string, string> {
  const apiKey = process.env.HYPERTRACKER_API_KEY;
  if (!apiKey) throw new Error('HYPERTRACKER_API_KEY is not set');
  return {
    Authorization: `Bearer ${apiKey}`,
    accept: 'application/json',
  };
}

/** API requires `start` (ISO 8601). Window sized to match positionRecencyTimeframe. */
function metricsTimeWindow(positionAge: PositionAge): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);

  const lookbackDays: Record<PositionAge, number> = {
    '24h': 7,
    '7d': 14,
    '30d': 30,
    all: 7,
  };

  start.setUTCDate(start.getUTCDate() - lookbackDays[positionAge]);

  return { start: start.toISOString(), end: end.toISOString() };
}

function positionsTimeWindow(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - POSITIONS_LOOKBACK_DAYS);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function positionAgeToExportWindow(positionAge: PositionAge): BiasExportWindow {
  const map: Record<PositionAge, BiasExportWindow> = {
    all: 'segment-metrics',
    '24h': 'segment-metrics-24h',
    '7d': 'segment-metrics-7d',
    '30d': 'segment-metrics-30d',
  };
  return map[positionAge];
}

async function getJson<T>(url: string, label: string, init?: RequestInit): Promise<T> {
  const startedAt = Date.now();
  logApiRequest(SERVICE, init?.method ?? 'GET', url);

  try {
    const res = await fetch(url, init);
    const ms = Date.now() - startedAt;

    if (!res.ok) {
      const body = await res.text();
      logApiError(SERVICE, label, res.status, url, body, { ms });
      throw new Error(`${label}: ${res.status} ${body}`);
    }

    const data = (await res.json()) as T;
    logApiSuccess(SERVICE, label, res.status, { ms });
    return data;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    logApiNetworkError(SERVICE, label, url, error);
    throw error;
  }
}

export async function fetchPositionMetrics(
  coin: string,
  segmentId: CohortId,
  positionAge: PositionAge = '24h',
  limit = 1
): Promise<PositionMetricSnapshot | null> {
  const cacheKey = `position_metrics_${coin.toUpperCase()}_${segmentId}_${positionAge}_${limit}`;
  const cached = getCache<PositionMetricSnapshot | null>(cacheKey);
  if (cached) {
    logApiCacheHit(SERVICE, 'position-metrics', cacheKey);
    return cached;
  }

  const { start, end } = metricsTimeWindow(positionAge);
  const params = new URLSearchParams({
    limit: String(limit),
    positionRecencyTimeframe: positionAge,
    start,
    end,
  });

  const url = `${BASE_URL}/api/external/position-metrics/coin/${coin.toUpperCase()}/segment/${segmentId}?${params}`;
  const label = `position-metrics coin=${coin} segment=${segmentId}`;

  const data = await getJson<PositionMetricsResponse>(url, label, { headers: headers() });
  const latest = data.metrics[0] ?? null;
  setCache(cacheKey, latest, 600);
  return latest;
}

export async function fetchWhalePositionMetrics(
  coin: string,
  positionAge: PositionAge = '24h'
): Promise<PositionMetricSnapshot[]> {
  console.log(`[${SERVICE}] fetching whale position-metrics`, { coin, positionAge, segments: WHALE_COHORT_IDS });
  const results = await Promise.all(
    WHALE_COHORT_IDS.map((id) => fetchPositionMetrics(coin, id, positionAge))
  );
  return results.filter((r): r is PositionMetricSnapshot => r !== null);
}

export async function fetchBiasTrendExport(
  coin: string,
  positionAge: PositionAge = '24h'
): Promise<BiasExportResponse> {
  const window = positionAgeToExportWindow(positionAge);
  const cacheKey = `bias_export_${coin.toUpperCase()}_${window}`;
  const cached = getCache<BiasExportResponse>(cacheKey);
  if (cached) {
    logApiCacheHit(SERVICE, 'bias-export', cacheKey);
    return cached;
  }

  const url = `${BASE_URL}/api/external/exports/coins/${coin.toUpperCase()}/${window}`;
  const label = `bias-export coin=${coin} window=${window}`;

  const data = await getJson<BiasExportResponse>(url, label, {
    headers: headers(),
    redirect: 'follow',
  });
  setCache(cacheKey, data, 900);
  return data;
}

export async function fetchCohortPositions(
  coin: string,
  segmentId: CohortId,
  limit = POSITIONS_LIMIT
): Promise<PositionRecord[]> {
  const normalized = coin.toUpperCase();
  const cacheKey = `positions_${normalized}_${segmentId}_open_${limit}_3d`;
  const cached = getCache<PositionRecord[]>(cacheKey);
  if (cached) {
    logApiCacheHit(SERVICE, 'positions', cacheKey);
    return cached;
  }

  const { start, end } = positionsTimeWindow();
  const params = new URLSearchParams({
    coin: normalized,
    segmentId: String(segmentId),
    open: 'true',
    limit: String(limit),
    start,
    end,
  });

  const url = `${BASE_URL}/api/external/positions?${params}`;
  const label = `positions coin=${normalized} segment=${segmentId}`;

  const data = await getJson<PositionsResponse>(url, label, { headers: headers() });
  const positions = data.positions ?? [];
  setCache(cacheKey, positions, POSITIONS_CACHE_TTL);
  return positions;
}

export async function fetchDefaultCohortPositions(
  coin: string
): Promise<Map<CohortId, PositionRecord[]>> {
  const normalized = coin.toUpperCase();
  console.log(`[${SERVICE}] fetching positions`, {
    coin: normalized,
    segments: POSITIONS_DEFAULT_COHORT_IDS,
    lookbackDays: POSITIONS_LOOKBACK_DAYS,
  });

  const entries = await Promise.all(
    POSITIONS_DEFAULT_COHORT_IDS.map(async (id) => {
      const positions = await fetchCohortPositions(normalized, id);
      return [id, positions] as const;
    })
  );

  return new Map(entries);
}

// v2: belum dipanggil dari orchestrator
export async function fetchLeaderboard(
  rankBy: 'pnlDay' | 'pnlWeek' | 'pnlMonth' | 'pnlAllTime' = 'pnlAllTime',
  limit: 25 | 50 | 100 = 25
): Promise<{ totalCount: number; sumPnl: number; data: LeaderboardEntry[] }> {
  const cacheKey = `leaderboard_${rankBy}_${limit}`;
  const cached = getCache<{ totalCount: number; sumPnl: number; data: LeaderboardEntry[] }>(cacheKey);
  if (cached) {
    logApiCacheHit(SERVICE, 'leaderboard', cacheKey);
    return cached;
  }

  const params = new URLSearchParams({
    limit: String(limit),
    rankBy,
    orderBy: rankBy,
    order: 'desc',
  });

  const url = `${BASE_URL}/api/external/leaderboards/all-pnl?${params}`;
  const label = `leaderboard rankBy=${rankBy} limit=${limit}`;

  const data = await getJson<{ totalCount: number; sumPnl: number; data: LeaderboardEntry[] }>(
    url,
    label,
    { headers: headers() }
  );
  setCache(cacheKey, data, 1800);
  return data;
}
