import { formatUsd } from '../bot/formatter';
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
    `  ${index}. ${p.address}`,
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

function formatCohortSection(c: CohortPositionStats): string {
  if (c.positionCount === 0) {
    return `${c.emoji} ${c.cohortName.toUpperCase()} (${c.cohortId})\nTidak ada posisi terbuka`;
  }

  const pctSign = c.avgEntryVsMarkPct >= 0 ? '+' : '';
  const dominantSide = c.longCount >= c.shortCount ? 'long' : 'short';
  const lines = [
    `${c.emoji} ${c.cohortName.toUpperCase()} (${c.cohortId})`,
    `${c.positionCount} posisi terbuka | notional ${formatUsd(c.totalNotional)}`,
    formatSideDominance(c),
    `Avg entry ${formatPrice(c.weightedAvgEntry)} vs mark ${formatPrice(c.markPrice)} (${pctSign}${c.avgEntryVsMarkPct.toFixed(1)}% favorable ${dominantSide})`,
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

function formatConclusion(result: PositionsReportResult): string {
  const withData = result.cohorts.filter((c) => c.positionCount > 0);
  if (withData.length < 2) {
    return [
      'KESIMPULAN',
      withData.length === 0
        ? `Tidak ada posisi terbuka Leviathan/Smart Money untuk ${result.coin}.`
        : `Hanya ${withData[0].emoji} ${withData[0].cohortName} punya posisi terbuka.`,
      '⚠️ Bukan financial advice. DYOR.',
    ].join('\n');
  }

  const [a, b] = withData;
  const entryDiff =
    a.weightedAvgEntry > 0
      ? ((b.weightedAvgEntry - a.weightedAvgEntry) / a.weightedAvgEntry) * 100
      : 0;
  const entryDiffSign = entryDiff >= 0 ? '+' : '';
  const higher = entryDiff >= 0 ? b : a;
  const lower = entryDiff >= 0 ? a : b;

  const lines = [
    'KESIMPULAN',
    `${a.emoji} ${a.cohortName} avg entry ${formatPrice(a.weightedAvgEntry)} vs ${b.emoji} ${b.cohortName} ${formatPrice(b.weightedAvgEntry)} — ${higher.cohortName} masuk ${entryDiff >= 0 ? 'lebih tinggi' : 'lebih rendah'} (${entryDiffSign}${Math.abs(entryDiff).toFixed(1)}% vs ${lower.cohortName}).`,
    `${Math.round(a.pctInProfit)}% ${a.cohortName} in profit vs ${Math.round(b.pctInProfit)}% ${b.cohortName}.`,
    '⚠️ Bukan financial advice. DYOR.',
  ];

  return lines.join('\n');
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
