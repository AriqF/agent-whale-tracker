import { fetchBiasTrendExport, fetchWhalePositionMetrics } from '../api/hypertracker';
import { agentIntentToParsedIntent } from './intentParser';
import { buildSignalResult } from './signalAnalyzer';
import { formatSignalReport } from './reportFormatter';
import { escapeMarkdown } from '../utils/markdown';
import type { AgentIntent } from '../types';

export async function runSignalReport(intent: AgentIntent): Promise<string> {
  const parsed = agentIntentToParsedIntent(intent);

  console.log(`[Signal] coin=${parsed.coin} mode=${parsed.mode} cohort=${parsed.cohortFocus}`);

  const [snapshots, biasExport] = await Promise.all([
    fetchWhalePositionMetrics(parsed.coin, parsed.positionAge),
    fetchBiasTrendExport(parsed.coin, parsed.positionAge),
  ]);

  if (snapshots.length === 0) {
    return escapeMarkdown(
      `❌ Tidak ada data posisi whale untuk ${parsed.coin}. Pastikan ticker coin valid.`
    );
  }

  const signal = buildSignalResult(parsed, snapshots, biasExport);
  return escapeMarkdown(formatSignalReport(signal, intent.depth));
}
