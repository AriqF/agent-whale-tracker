import { chatCompletion } from './openai';
import type { ParsedIntent, PositionAge } from '../types';

const INTENT_PARSER_SYSTEM = `You are an intent parser for a crypto whale tracking agent.
Extract structured intent from the user's natural language query.

Respond ONLY in valid JSON with no preamble or markdown fences.

Schema:
{
  "coin": string,
  "cohortFocus": "whale" | "smart_money" | "all",
  "mode": "snapshot" | "trend" | "leaderboard",
  "positionAge": "all" | "24h" | "7d" | "30d"
}

Rules:
- "coin": uppercase ticker e.g. "BTC", "ETH". Default "BTC".
- "whale" = size-based cohorts (Leviathan, Tidal Whale, Whale)
- "smart_money" = PnL-based cohorts (Money Printer, Smart Money)
- "all" = both
- "trend" mode when user asks about historical pattern, last few days, accumulation
- "leaderboard" mode when user asks about top traders, who is winning, best trader
- "snapshot" mode is default (current positioning)
- positionAge default = "24h"`;

const DEFAULT_INTENT: ParsedIntent = {
  coin: 'BTC',
  cohortFocus: 'all',
  mode: 'snapshot',
  positionAge: '24h',
};

export async function parseIntent(userQuery: string): Promise<ParsedIntent> {
  try {
    const text = await chatCompletion(INTENT_PARSER_SYSTEM, userQuery, 200, true);
    const parsed = JSON.parse(text) as Partial<ParsedIntent>;

    return {
      coin: (parsed.coin ?? DEFAULT_INTENT.coin).toUpperCase(),
      cohortFocus: parsed.cohortFocus ?? DEFAULT_INTENT.cohortFocus,
      mode: parsed.mode ?? DEFAULT_INTENT.mode,
      positionAge: normalizePositionAge(parsed.positionAge),
    };
  } catch (err) {
    console.error('Intent parse fallback:', err);
    return { ...DEFAULT_INTENT };
  }
}

function normalizePositionAge(value: string | undefined): PositionAge {
  if (value === 'all' || value === '24h' || value === '7d' || value === '30d') {
    return value;
  }
  return '24h';
}
