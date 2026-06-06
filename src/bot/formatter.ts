// Telegram MarkdownV2 requires escaping these chars:
// _ * [ ] ( ) ~ ` > # + - = | { } . !

export { escapeMarkdown } from '../utils/markdown';

export function biasEmoji(bias: number): string {
  if (bias > 0.6) return '🟢';
  if (bias > 0.3) return '🟡';
  if (bias < -0.6) return '🔴';
  if (bias < -0.3) return '🟠';
  return '⚪';
}

export function formatBias(bias: number): string {
  return (bias >= 0 ? '+' : '') + bias.toFixed(2);
}

/** Format USD notional e.g. $1.83M, $492.1K */
export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
