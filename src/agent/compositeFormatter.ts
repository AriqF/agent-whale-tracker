import { formatBias } from '../bot/formatter';
import {
  directionLabel,
  formatKeyCohortSignalLine,
  formatKeyCohortTrendLine,
  getKeyCohortSignals,
  getKeyCohortTrends,
  sentimentLabel,
} from './reportFormatter';
import {
  formatCohortPositionLine,
  getDominantSide,
} from '../positions/positionFormatter';
import type {
  AgentSignalResult,
  CompositeAspect,
  PositionsReportResult,
} from '../types';

export interface CompositeBriefInput {
  signal: AgentSignalResult;
  positions: PositionsReportResult;
  aspects: CompositeAspect[];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function synthesizeConclusion(input: CompositeBriefInput): string {
  const { signal, positions } = input;
  const leviathan = positions.cohorts.find((c) => c.cohortId === 7);
  const smart = positions.cohorts.find((c) => c.cohortId === 9);

  const parts: string[] = [];

  if (signal.divergence.detected) {
    parts.push('Mixed signals — divergence antara size whale dan smart money');
  } else if (signal.overallSentiment === 'bullish') {
    parts.push('Bias whale cenderung bullish');
  } else if (signal.overallSentiment === 'bearish') {
    parts.push('Bias whale cenderung bearish');
  } else {
    parts.push('Bias whale netral — tidak ada confluence kuat');
  }

  if (leviathan && smart) {
    const levSide = getDominantSide(leviathan);
    const smartSide = getDominantSide(smart);

    if (levSide !== 'balanced' && smartSide !== 'balanced' && levSide !== smartSide) {
      parts.push('dominasi posisi Leviathan vs Smart Money berlawanan');
    } else if (levSide !== 'balanced') {
      parts.push(`dominasi posisi ${levSide.toUpperCase()} convergent`);
    }

    if (leviathan.weightedAvgEntry > 0 && smart.weightedAvgEntry > 0) {
      const entryGap =
        ((smart.weightedAvgEntry - leviathan.weightedAvgEntry) /
          leviathan.weightedAvgEntry) *
        100;
      if (Math.abs(entryGap) > 1) {
        parts.push(
          `Smart Money entry ${entryGap >= 0 ? 'lebih tinggi' : 'lebih rendah'} ${Math.abs(entryGap).toFixed(1)}% vs Leviathan`
        );
      }
    }
  }

  const biasBearish = signal.netBias < -0.3;
  const biasBullish = signal.netBias > 0.3;
  const posShort =
    leviathan &&
    smart &&
    getDominantSide(leviathan) === 'short' &&
    getDominantSide(smart) === 'short';
  const posLong =
    leviathan &&
    smart &&
    getDominantSide(leviathan) === 'long' &&
    getDominantSide(smart) === 'long';

  if (biasBearish && posShort) {
    return 'Confluence bearish — bias dan dominasi posisi align short.';
  }
  if (biasBullish && posLong) {
    return 'Confluence bullish — bias dan dominasi posisi align long.';
  }
  if (parts.length > 1) {
    return `${parts[0]}; ${parts.slice(1).join('; ')}.`;
  }
  return `${parts[0] ?? 'Data campuran'} — tunggu konvergensi sebelum entry directional.`;
}

export function formatCompositeBrief(input: CompositeBriefInput): string {
  const { signal, positions, aspects } = input;
  const sections: string[] = [
    `BRIEFING — ${signal.coin}`,
    `🕐 ${formatTimestamp(signal.timestamp)}`,
  ];

  if (aspects.includes('signal')) {
    const keySignals = getKeyCohortSignals(signal);
    sections.push(
      [
        'SENTIMEN',
        `Net ${directionLabel(signal.netDirection)} (${formatBias(signal.netBias)}) | ${sentimentLabel(signal.overallSentiment)}`,
        ...keySignals.map(formatKeyCohortSignalLine),
        signal.divergence.detected
          ? '⚡ Divergence: size whale vs smart money berlawanan'
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  if (aspects.includes('positions')) {
    const posLines = positions.cohorts
      .filter((c) => c.positionCount > 0)
      .map(formatCohortPositionLine);
    sections.push(
      ['POSISI (Leviathan + Smart Money)', ...(posLines.length ? posLines : ['Tidak ada posisi terbuka'])].join(
        '\n'
      )
    );
  }

  if (aspects.includes('trend')) {
    const keyTrends = getKeyCohortTrends(signal);
    sections.push(
      [
        'TREND',
        ...(keyTrends.length
          ? keyTrends.map(formatKeyCohortTrendLine)
          : ['Data trend tidak cukup']),
      ].join('\n')
    );
  }

  sections.push(`KESIMPULAN\n${synthesizeConclusion(input)}`);
  sections.push('⚠️ Bukan financial advice. DYOR.');

  return sections.join('\n\n');
}
