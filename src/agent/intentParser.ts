import { chatCompletion } from '../llm/nineRouter';
import type {
  AgentAction,
  AgentDepth,
  AgentIntent,
  CompositeAspect,
  ParsedIntent,
  PositionAge,
} from '../types';

const AGENT_INTENT_SYSTEM = `You are an intent router for a Hyperliquid whale tracking agent.
Extract structured intent from the user's query (Indonesian or English).

Respond ONLY in valid JSON with no preamble or markdown fences.

Schema:
{
  "coin": string | null,
  "action": "positions" | "signal_snapshot" | "signal_trend" | "composite" | "leaderboard" | "clarify",
  "depth": "brief" | "full",
  "cohortFocus": "whale" | "smart_money" | "all",
  "positionAge": "all" | "24h" | "7d" | "30d",
  "aspects": ["signal", "positions", "trend"]
}

Action routing (pick ONE):
- "positions": entry price, avg entry, liquidation/liq cluster, top wallets, per-wallet PnL, dominasi detail, "dari harga berapa masuk", "brief position"
- "signal_snapshot": current whale bias/sentiment, long vs short aggregate, divergence, "gimana posisi sekarang"
- "signal_trend": momentum, trend direction, accumulation/distribution, "arah trend", "akumulasi"
- "composite": query mentions TWO OR MORE of: bias/sentiment, entry/dominasi/position detail, trend/momentum — e.g. "accumulate + entry", "overview bias dan entry", "briefing BTC"
- "leaderboard": top traders, ranking
- "clarify": coin ticker cannot be determined

Rules:
- "coin": uppercase ticker e.g. BTC, ETH, SOL. null if unknown.
- "depth": "brief" for ringkas/singkat/brief/summary/overview/garis besar; else "full"
- "composite" queries always use depth "brief" and set "aspects" array
- For composite: include "signal" for bias, "positions" for entry/dominasi, "trend" for momentum/akumulasi
- positionAge default = "24h"`;

const DEFAULT_AGENT_INTENT: AgentIntent = {
  coin: 'BTC',
  action: 'signal_snapshot',
  depth: 'full',
  cohortFocus: 'all',
  positionAge: '24h',
};

const COIN_STOP_WORDS = new Set([
  'THE', 'AND', 'FOR', 'ATAU', 'DAN', 'GIMANA', 'BAGAIMANA', 'BERIKAN', 'SAYA',
  'DARI', 'APA', 'YANG', 'LGI', 'LAGI', 'GA', 'TIDAK', 'ADALAH', 'INI', 'ITU',
  'WHALE', 'WHALES', 'POSITION', 'POSITIONS', 'SIGNAL', 'TREND', 'BRIEF',
  'OVERVIEW', 'BRIEFING', 'SMART', 'MONEY', 'LONG', 'SHORT',
  // Indonesian query words often matched as false tickers
  'DOMINASI', 'POSISI', 'SENTIMEN', 'SENTIMENT', 'MOMENTUM', 'AKUMULASI',
  'DISTRIBUSI', 'ARAH', 'GAMBARAN', 'LENGKAP', 'ENTRY', 'HARGA', 'MASUK',
  'LIQUIDAT', 'LIQUIDATION', 'BIAS', 'RINGKAS', 'SINGKAT', 'SECARA', 'GARIS',
  'BESAR', 'SEKARANG', 'LIVE', 'OPEN', 'CLOSE', 'NET', 'ALIGN', 'CONFLUENCE',
  'ACCUMULATE', 'DISTRIBUTE', 'MARKET', 'PRICE', 'COIN', 'TOKEN',
]);

/** Common Hyperliquid tickers — prefer when multiple candidates exist */
const KNOWN_TICKERS = new Set([
  'BTC', 'ETH', 'SOL', 'HYPE', 'DOGE', 'WIF', 'PEPE', 'AVAX', 'ARB', 'OP',
  'LINK', 'SUI', 'APT', 'NEAR', 'BNB', 'XRP', 'MATIC', 'POL', 'LTC', 'BCH',
  'ADA', 'DOT', 'ATOM', 'FTM', 'INJ', 'TIA', 'SEI', 'JUP', 'WLD', 'STRK',
  'BLUR', 'PYTH', 'JTO', 'ONDO', 'ENA', 'PENDLE', 'EIGEN', 'MOODENG',
]);

export async function parseAgentIntent(userQuery: string): Promise<AgentIntent> {
  const deterministic = extractDeterministicIntent(userQuery);
  if (deterministic) return deterministic;

  const compositeHint = extractCompositeHeuristic(userQuery);
  if (compositeHint) return compositeHint;

  try {
    const text = await chatCompletion(AGENT_INTENT_SYSTEM, userQuery, 300, true);
    const parsed = JSON.parse(text) as Partial<
      AgentIntent & { coin: string | null; aspects?: CompositeAspect[] }
    >;

    const coin = resolveCoin(parsed.coin, userQuery);
    const action = normalizeAction(parsed.action);

    if (!coin || action === 'clarify') {
      return { ...DEFAULT_AGENT_INTENT, coin: coin ?? '', action: 'clarify' };
    }

    const depth =
      action === 'composite' ? 'brief' : detectBriefDepth(userQuery, normalizeDepth(parsed.depth));

    return {
      coin,
      action,
      depth,
      cohortFocus: normalizeCohortFocus(parsed.cohortFocus),
      positionAge: normalizePositionAge(parsed.positionAge),
      aspects:
        action === 'composite'
          ? normalizeAspects(parsed.aspects, userQuery)
          : undefined,
    };
  } catch (err) {
    console.error('Agent intent parse fallback:', err);
    return { ...DEFAULT_AGENT_INTENT, action: 'clarify', coin: '' };
  }
}

/** @deprecated use parseAgentIntent */
export async function parseIntent(userQuery: string): Promise<ParsedIntent> {
  const agent = await parseAgentIntent(userQuery);
  return agentIntentToParsedIntent(agent);
}

export function agentIntentToParsedIntent(intent: AgentIntent): ParsedIntent {
  return {
    coin: intent.coin,
    cohortFocus: intent.cohortFocus,
    mode: intent.action === 'signal_trend' ? 'trend' : 'snapshot',
    positionAge: intent.positionAge,
  };
}

export function optionsToAgentIntent(options: {
  coin: string;
  action?: AgentAction;
  mode?: ParsedIntent['mode'];
  depth?: AgentDepth;
  cohortFocus?: AgentIntent['cohortFocus'];
  positionAge?: PositionAge;
  aspects?: CompositeAspect[];
}): AgentIntent {
  const action =
    options.action ??
    (options.mode === 'trend' ? 'signal_trend' : 'signal_snapshot');

  return {
    coin: options.coin.toUpperCase(),
    action,
    depth: options.depth ?? 'full',
    cohortFocus: options.cohortFocus ?? 'all',
    positionAge: options.positionAge ?? '24h',
    aspects: options.aspects,
  };
}

function extractDeterministicIntent(query: string): AgentIntent | null {
  const trimmed = query.trim();

  const slash = trimmed.match(/^\/(signal|trend|positions?)(?:@\w+)?(?:\s+([A-Za-z0-9_]+))?$/i);
  if (slash) {
    const cmd = slash[1].toLowerCase();
    const coin = slash[2]?.toUpperCase();
    if (!coin) return { ...DEFAULT_AGENT_INTENT, coin: '', action: 'clarify' };

    const action: AgentAction =
      cmd === 'trend'
        ? 'signal_trend'
        : cmd === 'signal'
          ? 'signal_snapshot'
          : 'positions';

    return { ...DEFAULT_AGENT_INTENT, coin, action, depth: 'full' };
  }

  const structured = trimmed.match(/^(?:signal|trend|positions?)\s+([A-Za-z0-9_]+)$/i);
  if (structured) {
    const coin = structured[1].toUpperCase();
    const action: AgentAction = /^trend\b/i.test(trimmed)
      ? 'signal_trend'
      : /^positions?\b/i.test(trimmed)
        ? 'positions'
        : 'signal_snapshot';
    return { ...DEFAULT_AGENT_INTENT, coin, action, depth: 'full' };
  }

  return null;
}

function extractCompositeHeuristic(query: string): AgentIntent | null {
  const briefing = /\b(briefing|overview|gambaran\s+keseluruhan|gambaran\s+lengkap)\b/i.test(
    query
  );

  const wantsEntry = /\b(entry|harga|masuk|liquidat|dominasi|position|posisi\s+terbuka|dari\s+berapa)\b/i.test(
    query
  );
  const wantsBias = /\b(bias|posisi\s+whale|whale|smart\s+money|long|short|sentimen|sentiment|signal)\b/i.test(
    query
  );
  const wantsTrend = /\b(trend|momentum|akumulasi|distribusi|accumulate|arah)\b/i.test(query);

  const aspects: CompositeAspect[] = [];
  if (wantsBias || briefing) aspects.push('signal');
  if (wantsEntry || briefing) aspects.push('positions');
  if (wantsTrend) aspects.push('trend');

  const uniqueAspects = [...new Set(aspects)];
  if (uniqueAspects.length < 2 && !briefing) return null;

  const coin = extractCoinHeuristic(query);
  if (!coin) return null;

  return {
    coin,
    action: 'composite',
    depth: 'brief',
    cohortFocus: 'all',
    positionAge: '24h',
    aspects: uniqueAspects.length >= 2 ? uniqueAspects : ['signal', 'positions'],
  };
}

function extractCoinHeuristic(query: string): string | null {
  const matches = query.toUpperCase().match(/\b[A-Z][A-Z0-9]{1,7}\b/g) ?? [];
  const candidates = matches.filter((t) => !COIN_STOP_WORDS.has(t));
  if (!candidates.length) return null;

  const known = candidates.filter((t) => KNOWN_TICKERS.has(t));
  if (known.length) return known[known.length - 1];

  // Coin ticker usually at end: "dominasi posisi BTC"
  return candidates[candidates.length - 1];
}

function resolveCoin(llmCoin: string | null | undefined, query: string): string | null {
  const fromLlm = llmCoin?.trim().toUpperCase();
  if (fromLlm && !COIN_STOP_WORDS.has(fromLlm) && KNOWN_TICKERS.has(fromLlm)) {
    return fromLlm;
  }

  const fromQuery = extractCoinHeuristic(query);
  if (fromQuery) return fromQuery;

  if (fromLlm && !COIN_STOP_WORDS.has(fromLlm)) return fromLlm;

  return null;
}

function detectBriefDepth(query: string, llmDepth: AgentDepth): AgentDepth {
  if (/\b(brief|ringkas|singkat|summary|overview|secara\s+garis\s+besar|singkatnya)\b/i.test(query)) {
    return 'brief';
  }
  return llmDepth;
}

function normalizeAspects(
  aspects: CompositeAspect[] | undefined,
  query: string
): CompositeAspect[] {
  if (aspects?.length) {
    const valid = aspects.filter((a): a is CompositeAspect =>
      ['signal', 'positions', 'trend'].includes(a)
    );
    if (valid.length >= 2) return valid;
    if (valid.length === 1) {
      const other: CompositeAspect = valid[0] === 'signal' ? 'positions' : 'signal';
      return [valid[0], other];
    }
  }
  return inferAspectsFromQuery(query);
}

function inferAspectsFromQuery(query: string): CompositeAspect[] {
  const aspects: CompositeAspect[] = ['signal', 'positions'];
  if (/\b(trend|momentum|akumulasi|distribusi|accumulate|arah)\b/i.test(query)) {
    aspects.push('trend');
  }
  return aspects;
}

function normalizeAction(value: string | undefined): AgentAction {
  const valid: AgentAction[] = [
    'positions',
    'signal_snapshot',
    'signal_trend',
    'composite',
    'leaderboard',
    'clarify',
  ];
  if (value && valid.includes(value as AgentAction)) {
    return value as AgentAction;
  }
  return 'signal_snapshot';
}

function normalizeDepth(value: string | undefined): AgentDepth {
  return value === 'brief' ? 'brief' : 'full';
}

function normalizeCohortFocus(
  value: string | undefined
): AgentIntent['cohortFocus'] {
  if (value === 'whale' || value === 'smart_money' || value === 'all') {
    return value;
  }
  return 'all';
}

function normalizePositionAge(value: string | undefined): PositionAge {
  if (value === 'all' || value === '24h' || value === '7d' || value === '30d') {
    return value;
  }
  return '24h';
}
