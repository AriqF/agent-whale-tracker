import { escapeMarkdown } from '../../utils/markdown';
import type { MonitorAlertEvent, MonitorFingerprint } from '../../types';

export function formatPulseAlert(
  coin: string,
  prev: MonitorFingerprint,
  next: MonitorFingerprint,
  events: MonitorAlertEvent[]
): string {
  const lines = [
    `*Ocean Eyes — ${coin} pulse*`,
    '',
    ...events.map((e) => `• ${e.message}`),
    '',
    `Snapshot: net bias ${next.netBias >= 0 ? '+' : ''}${next.netBias.toFixed(2)} | sentiment ${next.overallSentiment}`,
    '',
    `Ketik "overview ${coin}" untuk briefing lengkap\\.`,
  ];

  return escapeMarkdown(lines.join('\n'));
}
