import { COHORT_META, WHALE_COHORT_IDS } from '../api/hypertracker';
import { computeBiasFromSnapshot } from '../signal/signalLogic';
import {
  classifyBias,
  computeStalePositionRisk,
  detectDivergence,
  detectTrend,
  parseBiasExportRows,
} from '../signal/signalLogic';
import type {
  AgentSignalResult,
  BiasExportResponse,
  CohortId,
  CohortSignal,
  CohortTrendSummary,
  ParsedIntent,
  PositionMetricSnapshot,
} from '../types';

function resolveSegmentMeta(
  segmentId: CohortId,
  biasExport: BiasExportResponse
): { name: string; emoji: string } {
  const fromExport = biasExport.data.find((s) => s.segment.id === segmentId)?.segment;
  const fallback = COHORT_META[segmentId];
  return {
    name: fromExport?.name ?? fallback?.name ?? `Segment ${segmentId}`,
    emoji: fromExport?.emoji ?? fallback?.emoji ?? '📊',
  };
}

function snapshotToSignal(
  snapshot: PositionMetricSnapshot,
  biasExport: BiasExportResponse
): CohortSignal {
  const meta = resolveSegmentMeta(snapshot.segmentId, biasExport);
  const bias = computeBiasFromSnapshot(snapshot);
  const stale = computeStalePositionRisk(snapshot);
  const longValue = snapshot.totalPositionValueLong;
  const shortValue = snapshot.totalPositionValue - snapshot.totalPositionValueLong;

  return {
    cohortId: snapshot.segmentId,
    cohortName: meta.name,
    emoji: meta.emoji,
    bias,
    direction: classifyBias(bias),
    unrealizedPnlRatio: stale.unrealizedPnlRatio,
    isStalePosition: stale.isStalePosition,
    longValue,
    shortValue,
    totalPositionValue: snapshot.totalPositionValue,
    totalUnrealizedPnl: snapshot.totalUnrealizedPnl,
    tradersInPosition: snapshot.positionCount,
  };
}

function buildCohortTrends(
  biasExport: BiasExportResponse,
  cohortIds: CohortId[]
): CohortTrendSummary[] {
  return cohortIds.flatMap((id) => {
    const segment = biasExport.data.find((s) => s.segment.id === id);
    if (!segment) return [];

    const rows = parseBiasExportRows(segment);
    const meta = resolveSegmentMeta(id, biasExport);
    return [
      {
        cohortId: id,
        cohortName: meta.name,
        emoji: meta.emoji,
        latestBias: rows[0]?.bias ?? 0,
        trend: detectTrend(rows),
      },
    ];
  });
}

export function buildSignalResult(
  intent: ParsedIntent,
  snapshots: PositionMetricSnapshot[],
  biasExport: BiasExportResponse
): AgentSignalResult {
  const effectiveMode = intent.mode === 'leaderboard' ? 'snapshot' : intent.mode;

  const allSignals = WHALE_COHORT_IDS.flatMap((id) => {
    const snapshot = snapshots.find((s) => s.segmentId === id);
    return snapshot ? [snapshotToSignal(snapshot, biasExport)] : [];
  });

  const cohortSignals = filterByCohortFocus(allSignals, intent.cohortFocus);

  // Divergence size vs smart money butuh data kedua kelompok — pakai full fetch
  const divergence = detectDivergence(allSignals);
  const cohortTrends = buildCohortTrends(biasExport, cohortSignals.map((c) => c.cohortId));

  const whaleExportSegment = biasExport.data.find((s) => s.segment.id === 5);
  const trend = whaleExportSegment
    ? detectTrend(parseBiasExportRows(whaleExportSegment))
    : {
        direction: 'insufficient_data' as const,
        biasShift: 0,
        startTimestamp: '',
        latestTimestamp: '',
        description: 'Data export tidak tersedia.',
      };

  const netBias =
    cohortSignals.reduce((sum, c) => sum + c.bias, 0) / (cohortSignals.length || 1);
  const netDirection = classifyBias(netBias);
  const staleCount = cohortSignals.filter((c) => c.isStalePosition).length;

  const result: AgentSignalResult = {
    coin: intent.coin,
    timestamp: new Date().toISOString(),
    positionAge: intent.positionAge,
    mode: effectiveMode === 'trend' ? 'trend' : 'snapshot',
    cohortSignals,
    cohortTrends,
    netBias,
    netDirection,
    divergence,
    trend,
    overallSentiment: divergence.detected
      ? 'conflicted'
      : netBias > 0.3
        ? 'bullish'
        : netBias < -0.3
          ? 'bearish'
          : 'neutral',
    staleWarning: staleCount >= Math.ceil(cohortSignals.length / 2),
    rawSummary: '',
  };

  result.rawSummary = JSON.stringify(result);
  return result;
}

function filterByCohortFocus(
  signals: CohortSignal[],
  focus: ParsedIntent['cohortFocus']
): CohortSignal[] {
  if (focus === 'whale') return signals.filter((c) => [5, 6, 7].includes(c.cohortId));
  if (focus === 'smart_money') return signals.filter((c) => [8, 9].includes(c.cohortId));
  return signals;
}
