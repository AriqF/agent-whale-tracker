import {
  fetchBiasTrendExport,
  fetchDefaultCohortPositions,
  fetchWhalePositionMetrics,
} from '../api/hypertracker';
import { aggregateCohortPositions } from '../positions/positionAggregator';
import { agentIntentToParsedIntent } from './intentParser';
import { buildSignalResult } from './signalAnalyzer';
import { formatCompositeBrief } from './compositeFormatter';
import { escapeMarkdown } from '../utils/markdown';
import type { AgentIntent } from '../types';

export async function runCompositeReport(intent: AgentIntent): Promise<string> {
  const aspects = intent.aspects ?? ['signal', 'positions'];
  const parsed = agentIntentToParsedIntent({ ...intent, action: 'signal_snapshot' });

  console.log(
    `[Composite] coin=${intent.coin} aspects=[${aspects.join(',')}] — fetching 8 endpoints max`
  );

  const [snapshots, biasExport, positionsMap] = await Promise.all([
    fetchWhalePositionMetrics(parsed.coin, parsed.positionAge),
    fetchBiasTrendExport(parsed.coin, parsed.positionAge),
    fetchDefaultCohortPositions(parsed.coin),
  ]);

  if (snapshots.length === 0) {
    return escapeMarkdown(
      `❌ Tidak ada data whale untuk ${parsed.coin}. Pastikan ticker coin valid.`
    );
  }

  const signal = buildSignalResult(parsed, snapshots, biasExport);
  const positions = aggregateCohortPositions(parsed.coin, positionsMap);

  return escapeMarkdown(formatCompositeBrief({ signal, positions, aspects }));
}
