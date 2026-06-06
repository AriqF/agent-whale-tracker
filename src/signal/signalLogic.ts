import type {
  BiasExportSegment,
  BiasMetricRow,
  CohortSignal,
  DivergenceSignal,
  PositionMetricSnapshot,
  TrendSignal,
} from '../types';

export function normalizeExposureBias(exposureRatio: number): number {
  // API export `bias` = totalPositionValueLong / totalPositionValue (0–1)
  // Internal model: -1 (all short) … +1 (all long)
  return 2 * exposureRatio - 1;
}

export function computeBiasFromSnapshot(snapshot: PositionMetricSnapshot): number {
  if (snapshot.totalPositionValue === 0) return 0;
  const exposureRatio = snapshot.totalPositionValueLong / snapshot.totalPositionValue;
  return normalizeExposureBias(exposureRatio);
}

export function classifyBias(bias: number): CohortSignal['direction'] {
  if (bias > 0.6) return 'strong_long';
  if (bias > 0.3) return 'mild_long';
  if (bias < -0.6) return 'strong_short';
  if (bias < -0.3) return 'mild_short';
  return 'neutral';
}

export function computeStalePositionRisk(snapshot: PositionMetricSnapshot): {
  unrealizedPnlRatio: number;
  isStalePosition: boolean;
} {
  const { totalPositionValue, totalUnrealizedPnl, positionCount, positionCountLong } = snapshot;

  if (totalPositionValue <= 0 || positionCount <= 0) {
    return { unrealizedPnlRatio: 0, isStalePosition: false };
  }

  // Proxy: fraction of long positions weighted by unrealized PnL direction
  const longRatio = positionCountLong / positionCount;
  const pnlRatio = totalUnrealizedPnl / totalPositionValue;
  const bias = computeBiasFromSnapshot(snapshot);

  const alignedProfit =
    (bias > 0.3 && pnlRatio > 0) || (bias < -0.3 && pnlRatio < 0);
  const unrealizedPnlRatio = alignedProfit
    ? Math.max(longRatio, Math.abs(pnlRatio))
    : Math.abs(pnlRatio);

  const isStalePosition = alignedProfit && unrealizedPnlRatio > 0.7;

  return { unrealizedPnlRatio, isStalePosition };
}

export function detectDivergence(whaleCohorts: CohortSignal[]): DivergenceSignal {
  const smartMoney = whaleCohorts.filter((c) => [8, 9].includes(c.cohortId));
  const sizeWhales = whaleCohorts.filter((c) => [7, 6].includes(c.cohortId));

  const noDivergence: DivergenceSignal = {
    detected: false,
    type: 'none',
    description: 'No significant divergence detected.',
    smartMoneyDirection: 'neutral',
    retailDirection: 'neutral',
  };

  if (smartMoney.length === 0 || sizeWhales.length === 0) {
    return noDivergence;
  }

  const avgSmartBias = average(smartMoney.map((c) => c.bias));
  const avgSizeWhaleBias = average(sizeWhales.map((c) => c.bias));
  const smartDir = directionFromBias(avgSmartBias);
  const sizeDir = directionFromBias(avgSizeWhaleBias);

  const internalDivergence =
    smartDir !== 'neutral' &&
    sizeDir !== 'neutral' &&
    smartDir !== sizeDir &&
    Math.abs(avgSmartBias - avgSizeWhaleBias) > 0.4;

  if (internalDivergence) {
    return {
      detected: true,
      type: 'size_vs_pnl',
      description: `Size whale (${avgSizeWhaleBias > 0 ? 'LONG' : 'SHORT'} bias=${avgSizeWhaleBias.toFixed(2)}) vs Smart Money (${avgSmartBias > 0 ? 'LONG' : 'SHORT'} bias=${avgSmartBias.toFixed(2)}). High uncertainty.`,
      smartMoneyDirection: smartDir,
      retailDirection: 'neutral',
    };
  }

  return noDivergence;
}

function directionFromBias(bias: number): 'long' | 'short' | 'neutral' {
  if (bias > 0.1) return 'long';
  if (bias < -0.1) return 'short';
  return 'neutral';
}

function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function parseBiasExportRows(segment: BiasExportSegment): BiasMetricRow[] {
  const cols = segment.metrics.columns;
  return segment.metrics.data.map((row) => ({
    positionCount: row[cols.indexOf('positionCount')] as number,
    positionCountLong: row[cols.indexOf('positionCountLong')] as number,
    totalPositionValue: row[cols.indexOf('totalPositionValue')] as number,
    totalPositionValueLong: row[cols.indexOf('totalPositionValueLong')] as number,
    bias: normalizeExposureBias(row[cols.indexOf('bias')] as number),
    timestamp: row[cols.indexOf('timestamp')] as string,
  }));
}

export function detectTrend(rows: BiasMetricRow[]): TrendSignal {
  if (rows.length < 4) {
    return {
      direction: 'insufficient_data',
      biasShift: 0,
      startTimestamp: '',
      latestTimestamp: '',
      description: 'Data historis tidak cukup.',
    };
  }

  const latest = rows[0];
  const oldest = rows[rows.length - 1];
  const threeBack = rows[3];

  const biasShift = latest.bias - threeBack.bias;

  const last3 = rows.slice(0, 3);
  const isAccumulating = last3[0].bias > last3[1].bias && last3[1].bias > last3[2].bias;
  const isDistributing = last3[0].bias < last3[1].bias && last3[1].bias < last3[2].bias;

  return {
    direction: isAccumulating ? 'accumulating' : isDistributing ? 'distributing' : 'stable',
    biasShift,
    startTimestamp: oldest.timestamp,
    latestTimestamp: latest.timestamp,
    description: isAccumulating
      ? `Whale bias naik konsisten: ${oldest.bias.toFixed(2)} → ${latest.bias.toFixed(2)} (3 snapshot terakhir)`
      : isDistributing
        ? `Whale bias turun: ${oldest.bias.toFixed(2)} → ${latest.bias.toFixed(2)} — potensi distribusi/take profit`
        : `Bias relatif stabil di range ${Math.min(...rows.slice(0, 4).map((r) => r.bias)).toFixed(2)}–${Math.max(...rows.slice(0, 4).map((r) => r.bias)).toFixed(2)}`,
  };
}
