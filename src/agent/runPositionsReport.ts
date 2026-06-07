import { fetchDefaultCohortPositions } from '../api/hypertracker';
import { aggregateCohortPositions } from '../positions/positionAggregator';
import { formatPositionsReport, formatPositionsBrief } from '../positions/positionFormatter';
import { escapeMarkdown } from '../utils/markdown';

export async function runPositionsReport(
  coin: string,
  options?: { depth?: 'brief' | 'full' }
): Promise<string> {
  try {
    const normalized = coin.toUpperCase();
    console.log(`[Positions] fetching coin=${normalized} cohorts=[7,9] depth=${options?.depth ?? 'full'}`);

    const raw = await fetchDefaultCohortPositions(normalized);
    const result = aggregateCohortPositions(normalized, raw);
    const report =
      options?.depth === 'brief'
        ? formatPositionsBrief(result)
        : formatPositionsReport(result);

    return escapeMarkdown(report);
  } catch (err) {
    console.error('Positions report error:', err);
    return escapeMarkdown(
      'Gagal mengambil data posisi dari HyperTracker. Cek API key dan koneksi.'
    );
  }
}
