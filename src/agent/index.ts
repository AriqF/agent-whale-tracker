import { fetchBiasTrendExport, fetchWhalePositionMetrics } from '../api/hypertracker';
import { parseIntent } from './intentParser';
import { buildSignalResult } from './signalAnalyzer';
import { formatSignalReport } from './reportFormatter';
import { escapeMarkdown } from '../utils/markdown';
import type { RunAgentOptions } from '../types';

export async function runWhaleSignalAgent(
  userQuery: string,
  options?: RunAgentOptions
): Promise<string> {
  try {
    const intent = await parseIntent(userQuery);

    if (options?.cohortFocus) intent.cohortFocus = options.cohortFocus;
    if (options?.mode) intent.mode = options.mode;

    if (intent.mode === 'leaderboard') {
      intent.mode = 'snapshot';
    }

    const [snapshots, biasExport] = await Promise.all([
      fetchWhalePositionMetrics(intent.coin, intent.positionAge),
      fetchBiasTrendExport(intent.coin, intent.positionAge),
    ]);

    if (snapshots.length === 0) {
      return escapeMarkdown(
        `❌ Tidak ada data posisi whale untuk ${intent.coin}. Pastikan ticker coin valid.`
      );
    }

    const signal = buildSignalResult(intent, snapshots, biasExport);
    const report = formatSignalReport(signal);

    return escapeMarkdown(report);
  } catch (err) {
    console.error('Agent error:', err);
    return escapeMarkdown(
      'Gagal mengambil data dari HyperTracker. Cek API key dan koneksi.'
    );
  }
}
