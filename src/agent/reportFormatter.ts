import { WHALE_COHORT_IDS } from '../api/hypertracker';
import { biasEmoji, formatBias, formatUsd } from '../bot/formatter';
import type { AgentDepth, AgentSignalResult, CohortSignal } from '../types';

const BRIEF_COHORT_IDS = [7, 9] as const;

function directionLabel(direction: CohortSignal['direction']): string {
  return direction.replace(/_/g, ' ').toUpperCase();
}

function sentimentLabel(s: AgentSignalResult['overallSentiment']): string {
  const map = {
    bullish: 'BULLISH 🟢',
    bearish: 'BEARISH 🔴',
    neutral: 'NETRAL ⚪',
    conflicted: 'CONFLICTED ⚡',
  };
  return map[s];
}

function trendDirectionLabel(direction: AgentSignalResult['trend']['direction']): string {
  const map = {
    accumulating: 'AKUMULASI 📈',
    distributing: 'DISTRIBUSI 📉',
    stable: 'STABIL ➡️',
    insufficient_data: 'DATA KURANG',
  };
  return map[direction];
}

function formatPnlLine(c: CohortSignal): string {
  const pct =
    c.totalPositionValue > 0
      ? ((c.totalUnrealizedPnl / c.totalPositionValue) * 100).toFixed(2)
      : '0.00';
  const sign = c.totalUnrealizedPnl >= 0 ? '+' : '';
  return `unrealized PnL ${formatUsd(c.totalUnrealizedPnl)} (${sign}${pct}% notional)`;
}

function avgBias(signals: CohortSignal[]): number {
  if (!signals.length) return 0;
  return signals.reduce((s, c) => s + c.bias, 0) / signals.length;
}

function formatPositioningSection(result: AgentSignalResult): string {
  const lines = result.cohortSignals.map((c) => {
    const staleTag = c.isStalePosition ? ' | ⚠️ STALE' : '';
    return [
      `${c.emoji} ${c.cohortName}: ${directionLabel(c.direction)} (${formatBias(c.bias)}) ${biasEmoji(c.bias)}`,
      `  exposure LONG ${formatUsd(c.longValue)} / SHORT ${formatUsd(c.shortValue)}`,
      `  ${c.tradersInPosition} posisi | ${formatPnlLine(c)}${staleTag}`,
    ].join('\n');
  });
  return `POSITIONING — ${result.coin}\n${lines.join('\n')}`;
}

function formatSignalSection(result: AgentSignalResult): string {
  const lines: string[] = ['SIGNAL'];

  lines.push(
    `Sentimen net: ${directionLabel(result.netDirection)} (${formatBias(result.netBias)}) ${biasEmoji(result.netBias)}`
  );

  if (result.divergence.detected) {
    lines.push(`Alignment: CONFLICTED ⚡ (size whale vs smart money berlawanan)`);
  } else {
    lines.push(`Alignment: ${sentimentLabel(result.overallSentiment)}`);
  }

  const sizeWhales = result.cohortSignals.filter((c) => [5, 6, 7].includes(c.cohortId));
  const smartMoney = result.cohortSignals.filter((c) => [8, 9].includes(c.cohortId));

  if (sizeWhales.length) {
    lines.push(
      `Size whale avg (🐉🌊🐳): bias ${formatBias(avgBias(sizeWhales))} ${biasEmoji(avgBias(sizeWhales))}`
    );
  }
  if (smartMoney.length) {
    lines.push(
      `Smart money avg (💰📈): bias ${formatBias(avgBias(smartMoney))} ${biasEmoji(avgBias(smartMoney))}`
    );
  }

  if (result.divergence.detected) {
    lines.push(`⚡ DIVERGENCE: ${formatDivergenceId(result)}`);
  } else {
    lines.push('✓ Tidak ada divergence signifikan antara size whale (Leviathan+Tidal) dan smart money');
  }

  const intraSize = formatIntraSizeDivergence(sizeWhales);
  if (intraSize) lines.push(intraSize);

  if (result.staleWarning) {
    const staleCohorts = result.cohortSignals.filter((c) => c.isStalePosition);
    lines.push(
      `⚠️ STALE POSITION: ${staleCohorts.length}/${result.cohortSignals.length} cohort — bias mungkin dari entry lama, bukan sinyal fresh`
    );
    for (const c of staleCohorts) {
      lines.push(`  • ${c.emoji} ${c.cohortName}: ${formatPnlLine(c)}`);
    }
  }

  return lines.join('\n');
}

function formatDivergenceId(result: AgentSignalResult): string {
  const smart = result.cohortSignals.filter((c) => [8, 9].includes(c.cohortId));
  const sizeTop = result.cohortSignals.filter((c) => [7, 6].includes(c.cohortId));
  if (!smart.length || !sizeTop.length) return result.divergence.description;

  const avgSmart = avgBias(smart);
  const avgSize = avgBias(sizeTop);
  const smartDir = avgSmart > 0.1 ? 'LONG' : avgSmart < -0.1 ? 'SHORT' : 'NETRAL';
  const sizeDir = avgSize > 0.1 ? 'LONG' : avgSize < -0.1 ? 'SHORT' : 'NETRAL';
  return `Leviathan+Tidal (${sizeDir} ${formatBias(avgSize)}) vs Smart Money (${smartDir} ${formatBias(avgSmart)}) — conviction berlawanan`;
}

function formatIntraSizeDivergence(sizeWhales: CohortSignal[]): string | null {
  const leviathan = sizeWhales.find((c) => c.cohortId === 7);
  const tidal = sizeWhales.find((c) => c.cohortId === 6);
  const whale = sizeWhales.find((c) => c.cohortId === 5);
  if (!leviathan || !whale) return null;

  const topAvg = avgBias([leviathan, tidal].filter(Boolean) as CohortSignal[]);
  const diff = Math.abs(topAvg - whale.bias);
  if (diff <= 0.35 || Math.sign(topAvg) === Math.sign(whale.bias)) return null;

  return `⚡ Intra-size divergence: Leviathan+Tidal (${formatBias(topAvg)}) vs Whale (${formatBias(whale.bias)}) — tier whale tidak align`;
}

function formatTrendSection(result: AgentSignalResult): string {
  const lines: string[] = [`TREND — 7 hari (${result.coin})`];

  const ordered = WHALE_COHORT_IDS.map((id) =>
    result.cohortTrends.find((t) => t.cohortId === id)
  ).filter(Boolean) as AgentSignalResult['cohortTrends'];

  for (const ct of ordered) {
    const { trend, latestBias } = ct;
    const shift = formatBias(trend.biasShift);
    lines.push(
      `${ct.emoji} ${ct.cohortName}: ${trendDirectionLabel(trend.direction)} | shift ${shift} (3 snapshot) | bias sekarang ${formatBias(latestBias)}`
    );
  }

  if (result.mode === 'trend' && result.trend.description) {
    lines.push(`Referensi Whale cohort: ${result.trend.description}`);
  }

  return lines.join('\n');
}

function formatConclusionSection(result: AgentSignalResult): string {
  const { coin, overallSentiment, divergence, trend, staleWarning, netDirection, netBias } = result;
  const netLabel = directionLabel(netDirection).toLowerCase();

  if (divergence.detected) {
    return [
      'KESIMPULAN',
      `Whale ${coin} net ${netLabel} (${formatBias(netBias)}), tapi size whale dan smart money bergerak berlawanan.`,
      staleWarning
        ? 'Banyak posisi stale — jangan chase bias tanpa konfirmasi entry fresh.'
        : 'Tunggu konvergensi Leviathan+Tidal vs Smart Money sebelum entry directional.',
      '⚠️ Bukan financial advice. DYOR.',
    ].join('\n');
  }

  if (overallSentiment === 'bullish') {
    return [
      'KESIMPULAN',
      `Whale ${coin} cenderung bullish — cohort mayoritas bias long convergent.`,
      trend.direction === 'accumulating'
        ? 'Trend akumulasi mendukung — monitor breakout untuk konfirmasi.'
        : 'Trend belum konfirmasi akumulasi — tunggu bias shift positif konsisten.',
      '⚠️ Bukan financial advice. DYOR.',
    ].join('\n');
  }

  if (overallSentiment === 'bearish') {
    return [
      'KESIMPULAN',
      `Whale ${coin} cenderung bearish — sentimen net ${netLabel} (${formatBias(netBias)}), cohort mayoritas bias short.`,
      trend.direction === 'distributing'
        ? 'Trend distribusi aktif — hati-hati long catch.'
        : 'Monitor apakah distribusi berlanjut di snapshot berikutnya.',
      '⚠️ Bukan financial advice. DYOR.',
    ].join('\n');
  }

  return [
    'KESIMPULAN',
    `Whale ${coin} net ${netLabel} (${formatBias(netBias)}) — tidak ada confluence kuat antar cohort.`,
    staleWarning ? 'Posisi stale dominan — sinyal bias lemah untuk entry baru.' : 'Wait & see sampai alignment lebih jelas.',
    '⚠️ Bukan financial advice. DYOR.',
  ].join('\n');
}

function formatConclusionBrief(result: AgentSignalResult): string {
  const full = formatConclusionSection(result);
  const body = full
    .split('\n')
    .slice(1)
    .filter((l) => !l.startsWith('⚠️'))[0];
  return `KESIMPULAN: ${body ?? 'Data tidak cukup untuk kesimpulan.'}`;
}

function filterBriefCohorts<T extends { cohortId: number }>(items: T[]): T[] {
  return items.filter((c) => BRIEF_COHORT_IDS.includes(c.cohortId as 7 | 9));
}

export function formatSignalBrief(result: AgentSignalResult): string {
  const keySignals = filterBriefCohorts(result.cohortSignals);
  const keyTrends = filterBriefCohorts(result.cohortTrends);

  if (result.mode === 'trend') {
    const trendLines = keyTrends.map((ct) => {
      const shift = formatBias(ct.trend.biasShift);
      return `${ct.emoji} ${ct.cohortName}: ${trendDirectionLabel(ct.trend.direction)} | shift ${shift} | bias ${formatBias(ct.latestBias)}`;
    });

    return [
      `TREND — ${result.coin} (brief)`,
      ...trendLines,
      formatConclusionBrief(result),
      '⚠️ Bukan financial advice. DYOR.',
    ].join('\n\n');
  }

  const cohortLines = keySignals.map(
    (c) => `${c.emoji} ${c.cohortName}: ${directionLabel(c.direction)} (${formatBias(c.bias)})`
  );

  const lines = [
    `SIGNAL — ${result.coin} (brief)`,
    `Net: ${directionLabel(result.netDirection)} (${formatBias(result.netBias)}) ${biasEmoji(result.netBias)} | Sentimen: ${sentimentLabel(result.overallSentiment)}`,
    ...cohortLines,
  ];

  if (result.divergence.detected) {
    lines.push(`⚡ Divergence: size whale vs smart money berlawanan`);
  }

  lines.push(formatConclusionBrief(result));
  lines.push('⚠️ Bukan financial advice. DYOR.');

  return lines.join('\n\n');
}

/** Exported for composite formatter */
export function formatKeyCohortSignalLine(c: CohortSignal): string {
  return `${c.emoji} ${c.cohortName}: ${directionLabel(c.direction)} (${formatBias(c.bias)})`;
}

export function formatKeyCohortTrendLine(
  ct: AgentSignalResult['cohortTrends'][number]
): string {
  return `${ct.emoji} ${ct.cohortName}: ${trendDirectionLabel(ct.trend.direction)} | shift ${formatBias(ct.trend.biasShift)} | bias ${formatBias(ct.latestBias)}`;
}

export function getKeyCohortSignals(result: AgentSignalResult): CohortSignal[] {
  return filterBriefCohorts(result.cohortSignals);
}

export function getKeyCohortTrends(result: AgentSignalResult): AgentSignalResult['cohortTrends'] {
  return filterBriefCohorts(result.cohortTrends);
}

export { directionLabel, sentimentLabel, trendDirectionLabel };

export function formatSignalReport(
  result: AgentSignalResult,
  depth: AgentDepth = 'full'
): string {
  if (depth === 'brief') {
    return formatSignalBrief(result);
  }

  if (result.mode === 'trend') {
    return [formatTrendSection(result), formatConclusionSection(result)].join('\n\n');
  }

  return [
    formatPositioningSection(result),
    formatSignalSection(result),
    formatTrendSection(result),
    formatConclusionSection(result),
  ].join('\n\n');
}
