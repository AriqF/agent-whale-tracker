import { fetchDefaultCohortPositions } from '../api/hypertracker';
import { aggregateCohortPositions } from '../positions/positionAggregator';
import { formatPositionsReport, formatPositionsBrief } from '../positions/positionFormatter';
import { escapeMarkdownPreserveCode } from '../utils/markdown';
import type { PositionAge } from '../types';

export async function runPositionsReport(
  coin: string,
  options?: { depth?: 'brief' | 'full'; positionAge?: PositionAge }
): Promise<string> {
  try {
    const normalized = coin.toUpperCase();
    console.log(
      `[Positions] fetching coin=${normalized} cohorts=[7,9] depth=${options?.depth ?? 'full'} positionAge=${options?.positionAge ?? '24h'}`
    );

    const raw = await fetchDefaultCohortPositions(normalized);
    const result = aggregateCohortPositions(normalized, raw);
    const formatOpts = { positionAge: options?.positionAge };
    const report =
      options?.depth === 'brief'
        ? formatPositionsBrief(result, formatOpts)
        : formatPositionsReport(result, formatOpts);

    return escapeMarkdownPreserveCode(report);
  } catch (err) {
    console.error('Positions report error:', err);
    return escapeMarkdownPreserveCode(
      'Gagal mengambil data posisi dari HyperTracker. Cek API key dan koneksi.'
    );
  }
}
