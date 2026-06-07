import {
  COHORT_META,
  POSITIONS_DEFAULT_COHORT_IDS,
} from '../api/hypertracker';
import type {
  CohortId,
  CohortPositionStats,
  PositionRecord,
  PositionsReportResult,
} from '../types';

function validPositions(positions: PositionRecord[]): PositionRecord[] {
  return positions.filter((p) => p.positionValue > 0);
}

function sideAwareFavorablePct(p: PositionRecord): number {
  if (p.entryPrice <= 0) return 0;
  if (p.side === 'long') {
    return ((p.markPrice - p.entryPrice) / p.entryPrice) * 100;
  }
  return ((p.entryPrice - p.markPrice) / p.entryPrice) * 100;
}

function weightedAvgEntry(positions: PositionRecord[]): number {
  const total = positions.reduce((s, p) => s + p.positionValue, 0);
  if (total <= 0) return 0;
  return positions.reduce((s, p) => s + p.entryPrice * p.positionValue, 0) / total;
}

function weightedAvgFavorablePct(positions: PositionRecord[]): number {
  const total = positions.reduce((s, p) => s + p.positionValue, 0);
  if (total <= 0) return 0;
  return (
    positions.reduce((s, p) => s + sideAwareFavorablePct(p) * p.positionValue, 0) / total
  );
}

function avgMarkPrice(positions: PositionRecord[]): number {
  if (!positions.length) return 0;
  return positions.reduce((s, p) => s + p.markPrice, 0) / positions.length;
}

function pctInProfit(positions: PositionRecord[]): number {
  if (!positions.length) return 0;
  const count = positions.filter((p) => p.unrealizedPnl > 0).length;
  return (count / positions.length) * 100;
}

function pctFresh24h(positions: PositionRecord[]): number {
  if (!positions.length) return 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const count = positions.filter((p) => new Date(p.openTime).getTime() >= cutoff).length;
  return (count / positions.length) * 100;
}

function liqClusterHint(positions: PositionRecord[], mark: number): string | null {
  if (mark <= 0) return null;

  const bucketSize = mark * 0.05;
  const sides: Array<'long' | 'short'> = ['long', 'short'];
  const hints: string[] = [];

  for (const side of sides) {
    const relevant = positions.filter((p) => {
      if (p.liquidationPrice <= 0) return false;
      if (p.side !== side) return false;
      if (side === 'long') return p.liquidationPrice < mark;
      return p.liquidationPrice > mark;
    });

    if (relevant.length < 3) continue;

    const buckets = new Map<number, number>();
    for (const p of relevant) {
      const bucket = Math.round(p.liquidationPrice / bucketSize) * bucketSize;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }

    let bestBucket = 0;
    let bestCount = 0;
    for (const [bucket, count] of buckets) {
      if (count > bestCount) {
        bestBucket = bucket;
        bestCount = count;
      }
    }

    if (bestCount >= 3) {
      hints.push(`cluster liq ${side} ~$${formatLiqPrice(bestBucket)} (${bestCount} posisi)`);
    }
  }

  return hints.length ? hints.join(' | ') : null;
}

function formatLiqPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(2)}M`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(1)}K`;
  return price.toFixed(2);
}

function aggregateCohort(
  cohortId: CohortId,
  positions: PositionRecord[]
): CohortPositionStats {
  const meta = COHORT_META[cohortId];
  const valid = validPositions(positions);

  if (!valid.length) {
    return {
      cohortId,
      cohortName: meta.name,
      emoji: meta.emoji,
      positionCount: 0,
      totalNotional: 0,
      longCount: 0,
      shortCount: 0,
      longNotional: 0,
      shortNotional: 0,
      weightedAvgEntry: 0,
      markPrice: 0,
      avgEntryVsMarkPct: 0,
      pctInProfit: 0,
      pctFresh24h: 0,
      totalUnrealizedPnl: 0,
      topByNotional: [],
      liqClusterHint: null,
    };
  }

  const mark = avgMarkPrice(valid);
  const topByNotional = [...valid].sort((a, b) => b.positionValue - a.positionValue).slice(0, 3);
  const longNotional = valid
    .filter((p) => p.side === 'long')
    .reduce((s, p) => s + p.positionValue, 0);
  const shortNotional = valid
    .filter((p) => p.side === 'short')
    .reduce((s, p) => s + p.positionValue, 0);

  return {
    cohortId,
    cohortName: meta.name,
    emoji: meta.emoji,
    positionCount: valid.length,
    totalNotional: valid.reduce((s, p) => s + p.positionValue, 0),
    longCount: valid.filter((p) => p.side === 'long').length,
    shortCount: valid.filter((p) => p.side === 'short').length,
    longNotional,
    shortNotional,
    weightedAvgEntry: weightedAvgEntry(valid),
    markPrice: mark,
    avgEntryVsMarkPct: weightedAvgFavorablePct(valid),
    pctInProfit: pctInProfit(valid),
    pctFresh24h: pctFresh24h(valid),
    totalUnrealizedPnl: valid.reduce((s, p) => s + p.unrealizedPnl, 0),
    topByNotional,
    liqClusterHint: liqClusterHint(valid, mark),
  };
}

export function aggregateCohortPositions(
  coin: string,
  positionsByCohort: Map<CohortId, PositionRecord[]>
): PositionsReportResult {
  const cohorts = POSITIONS_DEFAULT_COHORT_IDS.map((id) =>
    aggregateCohort(id, positionsByCohort.get(id) ?? [])
  );

  return {
    coin: coin.toUpperCase(),
    timestamp: new Date().toISOString(),
    cohorts,
  };
}
