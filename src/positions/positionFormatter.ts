import { formatUsd } from '../bot/formatter';
import { inlineCode } from '../utils/markdown';
import type { CohortPositionStats, PositionRecord, PositionsReportResult } from '../types';

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  if (price >= 1_000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function formatTopPosition(index: number, p: PositionRecord): string {
  const pnlSign = p.unrealizedPnl >= 0 ? '+' : '';
  return [
    `${index}. ${inlineCode(p.address)}`,
    `     ${p.side.toUpperCase()} ${formatUsd(p.positionValue)} | entry ${formatPrice(p.entryPrice)} | PnL ${pnlSign}${formatUsd(p.unrealizedPnl)}`,
  ].join('\n');
}

function formatSideDominance(c: CohortPositionStats): string {
  const { longNotional, shortNotional, totalNotional, longCount, shortCount } = c;
  const diff = Math.abs(longNotional - shortNotional);
  const longShare = totalNotional > 0 ? (longNotional / totalNotional) * 100 : 0;
  const shortShare = totalNotional > 0 ? (shortNotional / totalNotional) * 100 : 0;
  const countDiff = Math.abs(longCount - shortCount);

  if (totalNotional <= 0) {
    return 'Dominasi: tidak ada data notional';
  }

  const balanced = diff / totalNotional < 0.05;
  if (balanced) {
    return [
      'Dominasi: seimbang',
      `LONG ${formatUsd(longNotional)} (${longShare.toFixed(0)}%) vs SHORT ${formatUsd(shortNotional)} (${shortShare.toFixed(0)}%)`,
      `selisih ${formatUsd(diff)} notional | ${longCount} long vs ${shortCount} short posisi`,
    ].join(' — ');
  }

  const dominant = longNotional > shortNotional ? 'LONG' : 'SHORT';
  const dominantShare = Math.max(longShare, shortShare);
  const weakerShare = Math.min(longShare, shortShare);

  return [
    `Dominasi: ${dominant}`,
    `selisih ${formatUsd(diff)} notional (${dominantShare.toFixed(0)}% vs ${weakerShare.toFixed(0)}%)`,
    `${longCount} long vs ${shortCount} short posisi (selisih ${countDiff} posisi)`,
  ].join(' — ');
}

export function getDominantSide(c: CohortPositionStats): 'long' | 'short' | 'balanced' {
  if (c.totalNotional <= 0) return 'balanced';
  const diff = Math.abs(c.longNotional - c.shortNotional);
  if (diff / c.totalNotional < 0.05) return 'balanced';
  return c.longNotional > c.shortNotional ? 'long' : 'short';
}

function getConvictionLabel(c: CohortPositionStats): 'long-heavy' | 'short-heavy' | 'balanced' {
  const side = getDominantSide(c);
  if (side === 'long') return 'long-heavy';
  if (side === 'short') return 'short-heavy';
  return 'balanced';
}

function formatEntryComparison(a: CohortPositionStats, b: CohortPositionStats): string {
  const entryDiff =
    a.weightedAvgEntry > 0
      ? ((b.weightedAvgEntry - a.weightedAvgEntry) / a.weightedAvgEntry) * 100
      : 0;
  const entryDiffSign = entryDiff >= 0 ? '+' : '';
  const higher = entryDiff >= 0 ? b : a;
  const lower = entryDiff >= 0 ? a : b;

  return `${a.emoji} ${a.cohortName} avg entry ${formatPrice(a.weightedAvgEntry)} vs ${b.emoji} ${b.cohortName} ${formatPrice(b.weightedAvgEntry)} — ${higher.cohortName} masuk ${entryDiff >= 0 ? 'lebih tinggi' : 'lebih rendah'} (${entryDiffSign}${Math.abs(entryDiff).toFixed(1)}% vs ${lower.cohortName}).`;
}

function formatCohortSection(c: CohortPositionStats): string {
  if (c.positionCount === 0) {
    return `${c.emoji} ${c.cohortName.toUpperCase()} (${c.cohortId})\nTidak ada posisi terbuka`;
  }

  const pctSign = c.avgEntryVsMarkPct >= 0 ? '+' : '';
  const dominantSide = getDominantSide(c);
  const entryVsMark =
    dominantSide === 'balanced'
      ? `Avg entry ${formatPrice(c.weightedAvgEntry)} vs mark ${formatPrice(c.markPrice)} (${pctSign}${c.avgEntryVsMarkPct.toFixed(1)}% vs mark)`
      : `Avg entry ${formatPrice(c.weightedAvgEntry)} vs mark ${formatPrice(c.markPrice)} (${pctSign}${c.avgEntryVsMarkPct.toFixed(1)}% favorable ${dominantSide})`;
  const lines = [
    `${c.emoji} ${c.cohortName.toUpperCase()} (${c.cohortId})`,
    `${c.positionCount} posisi terbuka | notional ${formatUsd(c.totalNotional)}`,
    formatSideDominance(c),
    entryVsMark,
    `Profit: ${Math.round(c.pctInProfit)}% posisi | Fresh <24h: ${Math.round(c.pctFresh24h)}%`,
    `PnL unrealized: ${c.totalUnrealizedPnl >= 0 ? '+' : ''}${formatUsd(c.totalUnrealizedPnl)}`,
  ];

  if (c.topByNotional.length) {
    lines.push('Top 3:');
    c.topByNotional.forEach((p, i) => lines.push(formatTopPosition(i + 1, p)));
  }

  if (c.liqClusterHint) {
    lines.push(`Liq cluster: ${c.liqClusterHint}`);
  }

  return lines.join('\n');
}

function isOpposingConviction(
  a: 'long-heavy' | 'short-heavy' | 'balanced',
  b: 'long-heavy' | 'short-heavy' | 'balanced'
): boolean {
  return (
    (a === 'long-heavy' && b === 'short-heavy') ||
    (a === 'short-heavy' && b === 'long-heavy')
  );
}

function formatCohortConvictionSummary(a: CohortPositionStats, b: CohortPositionStats): string {
  const aLabel = getConvictionLabel(a);
  const bLabel = getConvictionLabel(b);

  if (isOpposingConviction(aLabel, bLabel)) {
    return `${a.emoji} ${a.cohortName} ${aLabel} (avg entry ${formatPrice(a.weightedAvgEntry)}) vs ${b.emoji} ${b.cohortName} ${bLabel} (avg entry ${formatPrice(b.weightedAvgEntry)}) — conviction berlawanan, entry tidak comparable antar cohort.`;
  }

  if (aLabel === 'balanced' || bLabel === 'balanced') {
    return `${a.emoji} ${a.cohortName} ${aLabel} vs ${b.emoji} ${b.cohortName} ${bLabel} — dominasi berbeda, entry tidak dibandingkan langsung.`;
  }

  return formatEntryComparison(a, b);
}

function formatConclusion(result: PositionsReportResult): string {
  const withData = result.cohorts.filter((c) => c.positionCount > 0);
  const footer = '⚠️ Bukan financial advice. DYOR.';

  if (withData.length < 2) {
    return [
      'KESIMPULAN',
      withData.length === 0
        ? `Tidak ada posisi terbuka Leviathan/Smart Money untuk ${result.coin}.`
        : `Hanya ${withData[0].emoji} ${withData[0].cohortName} punya posisi terbuka.`,
      footer,
    ].join('\n');
  }

  const leviathan = withData.find((c) => c.cohortId === 7);
  const smart = withData.find((c) => c.cohortId === 9);

  if (leviathan && smart) {
    return [
      'KESIMPULAN',
      formatCohortConvictionSummary(leviathan, smart),
      `${Math.round(leviathan.pctInProfit)}% Leviathan in profit vs ${Math.round(smart.pctInProfit)}% Smart Money.`,
      footer,
    ].join('\n');
  }

  const [a, b] = withData;
  return [
    'KESIMPULAN',
    formatCohortConvictionSummary(a, b),
    `${Math.round(a.pctInProfit)}% ${a.cohortName} in profit vs ${Math.round(b.pctInProfit)}% ${b.cohortName}.`,
    footer,
  ].join('\n');
}

function formatSideDominanceBrief(c: CohortPositionStats): string {
  const { longNotional, shortNotional, totalNotional } = c;
  if (totalNotional <= 0) return 'tidak ada data';

  const diff = Math.abs(longNotional - shortNotional);
  const longShare = (longNotional / totalNotional) * 100;
  const shortShare = (shortNotional / totalNotional) * 100;

  if (diff / totalNotional < 0.05) {
    return `seimbang (${longShare.toFixed(0)}% long / ${shortShare.toFixed(0)}% short)`;
  }

  const dominant = longNotional > shortNotional ? 'LONG' : 'SHORT';
  const dominantShare = Math.max(longShare, shortShare);
  const weakerShare = Math.min(longShare, shortShare);
  return `${dominant} dominan selisih ${formatUsd(diff)} (${dominantShare.toFixed(0)}% vs ${weakerShare.toFixed(0)}%)`;
}

function formatCohortBriefLine(c: CohortPositionStats): string {
  if (c.positionCount === 0) {
    return `${c.emoji} ${c.cohortName.toUpperCase()}: tidak ada posisi terbuka`;
  }

  const pnlSign = c.totalUnrealizedPnl >= 0 ? '+' : '';
  return [
    `${c.emoji} ${c.cohortName.toUpperCase()}:`,
    formatSideDominanceBrief(c),
    `| avg entry ${formatPrice(c.weightedAvgEntry)} vs mark ${formatPrice(c.markPrice)}`,
    `| PnL ${pnlSign}${formatUsd(c.totalUnrealizedPnl)}`,
  ].join(' ');
}

function formatConclusionBrief(result: PositionsReportResult): string {
  const withData = result.cohorts.filter((c) => c.positionCount > 0);
  if (withData.length === 0) {
    return `KESIMPULAN: Tidak ada posisi terbuka Leviathan/Smart Money untuk ${result.coin}.`;
  }
  if (withData.length === 1) {
    return `KESIMPULAN: Hanya ${withData[0].emoji} ${withData[0].cohortName} punya posisi terbuka.`;
  }

  const leviathan = withData.find((c) => c.cohortId === 7);
  const smart = withData.find((c) => c.cohortId === 9);
  if (!leviathan || !smart) {
    return `KESIMPULAN: ${withData.map((c) => c.cohortName).join(' vs ')} — lihat detail di atas.`;
  }

  const leviathanSide = getConvictionLabel(leviathan);
  const smartSide = getConvictionLabel(smart);

  if (isOpposingConviction(leviathanSide, smartSide)) {
    return `KESIMPULAN: Leviathan ${leviathanSide}, Smart Money ${smartSide} — conviction berlawanan.`;
  }

  if (leviathanSide === 'balanced' || smartSide === 'balanced') {
    return `KESIMPULAN: Leviathan ${leviathanSide}, Smart Money ${smartSide} — dominasi berbeda.`;
  }

  return `KESIMPULAN: Leviathan dan Smart Money sama-sama ${leviathanSide} | ${Math.round(leviathan.pctInProfit)}% vs ${Math.round(smart.pctInProfit)}% in profit.`;
}

export function formatPositionsBrief(result: PositionsReportResult): string {
  const sections = [
    `POSITIONS — ${result.coin} (brief)`,
    `🕐 ${formatTimestamp(result.timestamp)}`,
    ...result.cohorts.map(formatCohortBriefLine),
    formatConclusionBrief(result),
    '⚠️ Bukan financial advice. DYOR.',
  ];

  return sections.join('\n\n');
}

/** Exported for composite formatter */
export function formatCohortPositionLine(c: CohortPositionStats): string {
  return formatCohortBriefLine(c);
}

export function formatPositionsReport(result: PositionsReportResult): string {
  const sections = [
    `POSITIONS — ${result.coin}`,
    `🕐 ${formatTimestamp(result.timestamp)}`,
    ...result.cohorts.map(formatCohortSection),
    formatConclusion(result),
  ];

  return sections.join('\n\n');
}
