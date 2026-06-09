import { fetchBiasTrendExport, fetchWhalePositionMetrics } from '../api/hypertracker';
import { buildSignalResult } from './signalAnalyzer';
import type { AgentSignalResult } from '../types';

export async function fetchSignalData(
  coin: string,
  mode: 'snapshot' | 'trend' = 'snapshot'
): Promise<AgentSignalResult | null> {
  const positionAge = '24h' as const;

  const [snapshots, biasExport] = await Promise.all([
    fetchWhalePositionMetrics(coin, positionAge),
    fetchBiasTrendExport(coin, positionAge),
  ]);

  if (snapshots.length === 0) return null;

  return buildSignalResult(
    { coin: coin.toUpperCase(), cohortFocus: 'all', mode, positionAge },
    snapshots,
    biasExport
  );
}
