import { parseAgentIntent, optionsToAgentIntent } from './intentParser';
import { runSignalReport } from './runSignalReport';
import { runPositionsReport } from './runPositionsReport';
import { runCompositeReport } from './runCompositeReport';
import { escapeMarkdown } from '../utils/markdown';
import type { AgentIntent, RunAgentOptions } from '../types';

function resolveIntent(query: string, options?: RunAgentOptions): Promise<AgentIntent> {
  if (options?.coin && (options.action || options.mode)) {
    return Promise.resolve(optionsToAgentIntent(options as RunAgentOptions & { coin: string }));
  }

  if (options?.coin) {
    return Promise.resolve(
      optionsToAgentIntent({
        coin: options.coin,
        action: options.action,
        mode: options.mode,
        depth: options.depth,
        cohortFocus: options.cohortFocus,
        positionAge: options.positionAge,
      })
    );
  }

  return parseAgentIntent(query);
}

export async function runAgent(userQuery: string, options?: RunAgentOptions): Promise<string> {
  try {
    const intent = await resolveIntent(userQuery, options);

    console.log(
      `[Agent] action=${intent.action} coin=${intent.coin} depth=${intent.depth} query=${userQuery}`
    );

    switch (intent.action) {
      case 'clarify':
        return escapeMarkdown(
          'Coin apa yang ingin dianalisis? Sebutkan ticker-nya, misalnya BTC, ETH, atau SOL.'
        );

      case 'positions':
        return runPositionsReport(intent.coin, { depth: intent.depth });

      case 'signal_snapshot':
      case 'signal_trend':
        return runSignalReport(intent);

      case 'composite':
        return runCompositeReport(intent);

      case 'leaderboard':
        return escapeMarkdown('Leaderboard top trader coming soon 🔜');

      default:
        return runSignalReport({ ...intent, action: 'signal_snapshot' });
    }
  } catch (err) {
    console.error('Agent router error:', err);
    return escapeMarkdown(
      'Gagal memproses permintaan. Cek API key dan koneksi, lalu coba lagi.'
    );
  }
}
