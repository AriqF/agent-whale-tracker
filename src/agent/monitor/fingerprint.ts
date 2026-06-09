import type { AgentSignalResult, ConvictionLabel, MonitorFingerprint } from '../../types';

export function convictionFromBias(bias: number): ConvictionLabel {
  if (bias > 0.1) return 'long-heavy';
  if (bias < -0.1) return 'short-heavy';
  return 'balanced';
}

function avgBias(signals: { bias: number }[]): number {
  if (!signals.length) return 0;
  return signals.reduce((sum, s) => sum + s.bias, 0) / signals.length;
}

function isOpposingConviction(a: ConvictionLabel, b: ConvictionLabel): boolean {
  return (
    (a === 'long-heavy' && b === 'short-heavy') ||
    (a === 'short-heavy' && b === 'long-heavy')
  );
}

export function buildFingerprint(result: AgentSignalResult): MonitorFingerprint {
  const leviathan = result.cohortSignals.find((c) => c.cohortId === 7);
  const smartSignals = result.cohortSignals.filter((c) => [8, 9].includes(c.cohortId));
  const smartMoneyBias = avgBias(smartSignals);

  const leviathanConviction = convictionFromBias(leviathan?.bias ?? 0);
  const smartMoneyConviction = convictionFromBias(smartMoneyBias);

  return {
    coin: result.coin,
    netBias: result.netBias,
    leviathanBias: leviathan?.bias ?? 0,
    smartMoneyBias,
    whaleTrendDirection: result.trend.direction,
    overallSentiment: result.overallSentiment,
    divergenceDetected: result.divergence.detected,
    leviathanConviction,
    smartMoneyConviction,
    capturedAt: result.timestamp,
  };
}

export { isOpposingConviction };
