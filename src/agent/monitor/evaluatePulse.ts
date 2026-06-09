import type { MonitorAlertEvent, MonitorFingerprint } from '../../types';
import { isOpposingConviction } from './fingerprint';

function biasShiftThreshold(): number {
  const value = Number(process.env.MONITOR_BIAS_SHIFT_THRESHOLD ?? 0.3);
  return Number.isFinite(value) && value > 0 ? value : 0.3;
}

function formatBias(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function trendLabel(direction: MonitorFingerprint['whaleTrendDirection']): string {
  switch (direction) {
    case 'accumulating':
      return 'AKUMULASI';
    case 'distributing':
      return 'DISTRIBUSI';
    case 'stable':
      return 'STABIL';
    default:
      return 'N/A';
  }
}

export function evaluatePulse(
  prev: MonitorFingerprint | null,
  next: MonitorFingerprint
): MonitorAlertEvent[] {
  if (!prev) return [];

  const threshold = biasShiftThreshold();
  const events: MonitorAlertEvent[] = [];

  const netDelta = next.netBias - prev.netBias;
  const leviathanDelta = next.leviathanBias - prev.leviathanBias;

  if (Math.abs(netDelta) >= threshold || Math.abs(leviathanDelta) >= threshold) {
    events.push({
      kind: 'bias_shift',
      message: `Net bias ${formatBias(prev.netBias)} → ${formatBias(next.netBias)} | Leviathan ${formatBias(prev.leviathanBias)} → ${formatBias(next.leviathanBias)}`,
    });
  }

  if (
    prev.whaleTrendDirection !== next.whaleTrendDirection &&
    prev.whaleTrendDirection !== 'insufficient_data' &&
    next.whaleTrendDirection !== 'insufficient_data'
  ) {
    events.push({
      kind: 'trend_change',
      message: `Whale trend ${trendLabel(prev.whaleTrendDirection)} → ${trendLabel(next.whaleTrendDirection)}`,
    });
  }

  if (prev.overallSentiment !== next.overallSentiment) {
    events.push({
      kind: 'sentiment_flip',
      message: `Sentiment ${prev.overallSentiment} → ${next.overallSentiment}`,
    });
  }

  if (!prev.divergenceDetected && next.divergenceDetected) {
    events.push({
      kind: 'divergence_new',
      message: 'Divergence baru terdeteksi antar cohort whale',
    });
  }

  const nowOpposing = isOpposingConviction(
    next.leviathanConviction,
    next.smartMoneyConviction
  );
  const prevOpposing = isOpposingConviction(
    prev.leviathanConviction,
    prev.smartMoneyConviction
  );

  if (nowOpposing && !prevOpposing) {
    events.push({
      kind: 'conviction_divergence',
      message: `Conviction berlawanan: Leviathan ${next.leviathanConviction} vs Smart Money ${next.smartMoneyConviction}`,
    });
  }

  return events;
}
