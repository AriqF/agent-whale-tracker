import { parseAgentIntent, optionsToAgentIntent } from './intentParser';
import { runSignalReport } from './runSignalReport';
import { runPositionsReport } from './runPositionsReport';
import { runCompositeReport } from './runCompositeReport';
import { loadChatContext, saveFromIntent } from './chatContext';
import { escapeMarkdown } from '../utils/markdown';
import type { AgentIntent, RunAgentOptions } from '../types';

function resolveIntent(
  query: string,
  options?: RunAgentOptions
): Promise<AgentIntent> {
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

  const contextPromise =
    options?.chatId != null ? loadChatContext(options.chatId) : Promise.resolve(null);

  return contextPromise.then((context) => parseAgentIntent(query, context));
}

export async function runAgent(userQuery: string, options?: RunAgentOptions): Promise<string> {
  try {
    const intent = await resolveIntent(userQuery, options);

    console.log(
      `[Agent] action=${intent.action} coin=${intent.coin} depth=${intent.depth} positionAge=${intent.positionAge} query=${userQuery}`
    );

    let result: string;

    switch (intent.action) {
      case 'clarify':
        result = escapeMarkdown(
          'Coin apa yang ingin dianalisis? Sebutkan ticker-nya, misalnya BTC, ETH, atau SOL.'
        );
        break;

      case 'positions':
        result = await runPositionsReport(intent.coin, {
          depth: intent.depth,
          positionAge: intent.positionAge,
        });
        break;

      case 'signal_snapshot':
      case 'signal_trend':
        result = await runSignalReport(intent);
        break;

      case 'composite':
        result = await runCompositeReport(intent);
        break;

      case 'leaderboard':
        result = escapeMarkdown('Leaderboard top trader coming soon 🔜');
        break;

      default:
        result = await runSignalReport({ ...intent, action: 'signal_snapshot' });
    }

    if (options?.chatId != null && intent.action !== 'clarify' && intent.coin) {
      await saveFromIntent(options.chatId, intent);
    }

    return result;
  } catch (err) {
    console.error('Agent router error:', err);
    return escapeMarkdown(
      'Gagal memproses permintaan. Cek API key dan koneksi, lalu coba lagi.'
    );
  }
}
