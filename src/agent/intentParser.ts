import { chatCompletion } from '../llm/nineRouter';
import {
  DEFAULT_POSITION_AGE,
  parsePositionAgeToken,
  resolvePositionAge,
  contextPositionAge,
} from './positionAge';
import type {
  AgentAction,
  AgentDepth,
  AgentIntent,
  ChatContext,
  CompositeAspect,
  ParsedIntent,
  PositionAge,
} from '../types';

const SLASH_COMMAND_REGEX =
  /^\/(signal|trend|positions?)(?:@\w+)?(?:\s+([A-Za-z0-9_]+))?(?:\s+(\S+))?$/i;

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
- "clarify": ONLY when coin ticker cannot be determined — never use clarify if coin is present in query

Rules:
- "coin": uppercase ticker e.g. BTC, ETH, SOL. null if unknown.
- "depth": "brief" for ringkas/singkat/brief/summary/overview/garis besar; else "full"
- "composite" queries always use depth "brief" and set "aspects" array
- For composite: include "signal" for bias, "positions" for entry/dominasi, "trend" for momentum/akumulasi
- positionAge: "24h" for scalping/intraday/short-term; "7d" for swing/weekly; "30d" for monthly/macro; default "24h"
- If previous session context is provided and the user query is a follow-up without a coin, inherit lastCoin and infer action from query; inherit lastPositionAge when timeframe not specified`;

const DEFAULT_AGENT_INTENT: AgentIntent = {
  coin: 'BTC',
  action: 'signal_snapshot',
  depth: 'full',
  cohortFocus: 'all',
  positionAge: DEFAULT_POSITION_AGE,
};

const COIN_STOP_WORDS = new Set([
  'THE', 'AND', 'FOR', 'ATAU', 'DAN', 'GIMANA', 'BAGAIMANA', 'BERIKAN', 'SAYA',
  'DARI', 'APA', 'YANG', 'LGI', 'LAGI', 'GA', 'TIDAK', 'ADALAH', 'INI', 'ITU',
  'WHALE', 'WHALES', 'POSITION', 'POSITIONS', 'SIGNAL', 'TREND', 'BRIEF',
  'OVERVIEW', 'BRIEFING', 'SMART', 'MONEY', 'LONG', 'SHORT',
  'DOMINASI', 'POSISI', 'SENTIMEN', 'SENTIMENT', 'MOMENTUM', 'AKUMULASI',
  'DISTRIBUSI', 'ARAH', 'GAMBARAN', 'LENGKAP', 'ENTRY', 'HARGA', 'MASUK',
  'LIQUIDAT', 'LIQUIDATION', 'BIAS', 'RINGKAS', 'SINGKAT', 'SECARA', 'GARIS',
  'BESAR', 'SEKARANG', 'LIVE', 'OPEN', 'CLOSE', 'NET', 'ALIGN', 'CONFLUENCE',
  'ACCUMULATE', 'DISTRIBUTE', 'MARKET', 'PRICE', 'COIN', 'TOKEN', 'JUGA',
  'INTRADAY', 'SCALPING', 'SWING', 'WEEKLY', 'MONTHLY', 'MACRO', 'UNTUK', 'POSISI',
  'DENGAN', 'TIMEFRAME', 'TIMEFRAMES',
]);

const KNOWN_TICKERS = new Set([
  'BTC', 'ETH', 'SOL', 'HYPE', 'DOGE', 'WIF', 'PEPE', 'AVAX', 'ARB', 'OP',
  'LINK', 'SUI', 'APT', 'NEAR', 'BNB', 'XRP', 'MATIC', 'POL', 'LTC', 'BCH',
  'ADA', 'DOT', 'ATOM', 'FTM', 'INJ', 'TIA', 'SEI', 'JUP', 'WLD', 'STRK',
  'BLUR', 'PYTH', 'JTO', 'ONDO', 'ENA', 'PENDLE', 'EIGEN', 'MOODENG', 'PENGU',
]);

function intentFromContext(
  context: ChatContext,
  overrides: Partial<AgentIntent>,
  query?: string
): AgentIntent {
  const base: AgentIntent = {
    ...DEFAULT_AGENT_INTENT,
    coin: context.lastCoin,
    action: context.lastAction,
    depth: context.lastDepth,
    positionAge: contextPositionAge(context),
    ...overrides,
  };
  return {
    ...base,
    positionAge: resolvePositionAge(
      overrides.positionAge ?? base.positionAge,
      query,
      context
    ),
  };
}

function applyContextHeuristic(
  query: string,
  context: ChatContext | null | undefined
): AgentIntent | null {
  if (!context?.lastCoin) return null;

  const trimmed = query.trim();
  const coinFromQuery = extractCoinHeuristic(trimmed);

  const slashNoCoin = trimmed.match(/^\/(signal|trend|positions?)(?:@\w+)?\s*$/i);
  if (slashNoCoin) {
    const cmd = slashNoCoin[1].toLowerCase();
    const action: AgentAction =
      cmd === 'trend'
        ? 'signal_trend'
        : cmd === 'signal'
          ? 'signal_snapshot'
          : 'positions';
    return intentFromContext(context, { action, depth: 'full' }, trimmed);
  }

  if (/\bpositions?\s+juga\b/i.test(trimmed) || /\bjuga\s+positions?\b/i.test(trimmed)) {
    return intentFromContext(
      context,
      { action: 'positions', depth: detectBriefDepth(trimmed, context.lastDepth) },
      trimmed
    );
  }
  if (/\btrend\s+juga\b/i.test(trimmed) || /\bjuga\s+trend\b/i.test(trimmed)) {
    return intentFromContext(
      context,
      { action: 'signal_trend', depth: detectBriefDepth(trimmed, context.lastDepth) },
      trimmed
    );
  }
  if (/\bsignal\s+juga\b/i.test(trimmed) || /\bjuga\s+signal\b/i.test(trimmed)) {
    return intentFromContext(
      context,
      { action: 'signal_snapshot', depth: detectBriefDepth(trimmed, context.lastDepth) },
      trimmed
    );
  }

  if (
    !coinFromQuery &&
    (/\b(brief|ringkas|singkat)\b/i.test(trimmed) || /\b(lebih detail|full|lengkap)\b/i.test(trimmed))
  ) {
    return intentFromContext(
      context,
      { depth: /\b(brief|ringkas|singkat)\b/i.test(trimmed) ? 'brief' : 'full' },
      trimmed
    );
  }

  if (!coinFromQuery) {
    if (/^trend$/i.test(trimmed)) {
      return intentFromContext(context, { action: 'signal_trend' }, trimmed);
    }
    if (/^positions?$/i.test(trimmed)) {
      return intentFromContext(context, { action: 'positions' }, trimmed);
    }
    if (/^signal$/i.test(trimmed)) {
      return intentFromContext(context, { action: 'signal_snapshot' }, trimmed);
    }

    const wantsTrend = /\b(trend|momentum|akumulasi|distribusi|arah)\b/i.test(trimmed);
    const wantsPositions = /\b(posisi|position|entry|dominasi|harga|masuk)\b/i.test(trimmed);
    const wantsSignal = /\b(signal|bias|sentimen|sentiment|whale)\b/i.test(trimmed);

    if (wantsTrend && !wantsPositions) {
      return intentFromContext(
        context,
        { action: 'signal_trend', depth: detectBriefDepth(trimmed, context.lastDepth) },
        trimmed
      );
    }
    if (wantsPositions && !wantsTrend && !wantsSignal) {
      return intentFromContext(
        context,
        { action: 'positions', depth: detectBriefDepth(trimmed, context.lastDepth) },
        trimmed
      );
    }
    if (wantsSignal && !wantsTrend && !wantsPositions) {
      return intentFromContext(
        context,
        { action: 'signal_snapshot', depth: detectBriefDepth(trimmed, context.lastDepth) },
        trimmed
      );
    }
  }

  return null;
}

function buildContextUserMessage(
  userQuery: string,
  context: ChatContext | null | undefined
): string {
  if (!context) return userQuery;

  const ageMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(context.updatedAt).getTime()) / 60_000)
  );

  const lines = [
    'Previous session context:',
    `- lastCoin: ${context.lastCoin}`,
    `- lastAction: ${context.lastAction}`,
    `- lastDepth: ${context.lastDepth}`,
    `- ageMinutes: ${ageMinutes}`,
  ];

  if (context.lastPositionAge) {
    lines.splice(4, 0, `- lastPositionAge: ${context.lastPositionAge}`);
  }

  lines.push('', `User query: ${userQuery}`);
  return lines.join('\n');
}

export async function parseAgentIntent(
  userQuery: string,
  context?: ChatContext | null
): Promise<AgentIntent> {
  const deterministic = extractDeterministicIntent(userQuery);
  if (deterministic) return deterministic;

  const compositeHint = extractCompositeHeuristic(userQuery, context);
  if (compositeHint) return compositeHint;

  const nlHint = extractNaturalLanguageHeuristic(userQuery, context);
  if (nlHint) return nlHint;

  const contextHint = applyContextHeuristic(userQuery, context);
  if (contextHint) return contextHint;

  try {
    const llmUser = buildContextUserMessage(userQuery, context);
    const text = await chatCompletion(AGENT_INTENT_SYSTEM, llmUser, 300, true);
    const parsed = JSON.parse(text) as Partial<
      AgentIntent & { coin: string | null; aspects?: CompositeAspect[] }
    >;

    const coin = resolveCoin(parsed.coin, userQuery, context);
    let action = normalizeAction(parsed.action);

    if (!coin) {
      return { ...DEFAULT_AGENT_INTENT, coin: '', action: 'clarify' };
    }

    if (action === 'clarify') {
      action = inferActionFromQuery(userQuery);
    }

    const depth =
      action === 'composite' ? 'brief' : detectBriefDepth(userQuery, normalizeDepth(parsed.depth));

    return {
      coin,
      action,
      depth,
      cohortFocus: normalizeCohortFocus(parsed.cohortFocus),
      positionAge: resolvePositionAge(
        normalizePositionAge(parsed.positionAge),
        userQuery,
        context
      ),
      aspects:
        action === 'composite'
          ? normalizeAspects(parsed.aspects, userQuery)
          : undefined,
    };
  } catch (err) {
    console.error('Agent intent parse fallback:', err);
    if (context?.lastCoin) {
      return intentFromContext(context, {}, userQuery);
    }
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
    positionAge: options.positionAge ?? DEFAULT_POSITION_AGE,
    aspects: options.aspects,
  };
}

export function parseSlashCommandArgs(text: string): {
  coin?: string;
  action?: AgentAction;
  positionAge: PositionAge;
} {
  const match = text.trim().match(SLASH_COMMAND_REGEX);
  if (!match) return { positionAge: DEFAULT_POSITION_AGE };

  const cmd = match[1].toLowerCase();
  const coin = match[2]?.toUpperCase();
  const timeframeToken = match[3];
  const positionAge = timeframeToken
    ? parsePositionAgeToken(timeframeToken) ?? DEFAULT_POSITION_AGE
    : DEFAULT_POSITION_AGE;

  const action: AgentAction =
    cmd === 'trend'
      ? 'signal_trend'
      : cmd === 'signal'
        ? 'signal_snapshot'
        : 'positions';

  return { coin, action, positionAge };
}

function extractDeterministicIntent(query: string): AgentIntent | null {
  const trimmed = query.trim();

  const slash = trimmed.match(SLASH_COMMAND_REGEX);
  if (slash) {
    const cmd = slash[1].toLowerCase();
    const coin = slash[2]?.toUpperCase();
    if (!coin) return { ...DEFAULT_AGENT_INTENT, coin: '', action: 'clarify' };

    const timeframeToken = slash[3];
    const positionAge = timeframeToken
      ? parsePositionAgeToken(timeframeToken) ?? DEFAULT_POSITION_AGE
      : DEFAULT_POSITION_AGE;

    const action: AgentAction =
      cmd === 'trend'
        ? 'signal_trend'
        : cmd === 'signal'
          ? 'signal_snapshot'
          : 'positions';

    return { ...DEFAULT_AGENT_INTENT, coin, action, depth: 'full', positionAge };
  }

  const structured = trimmed.match(
    /^(?:signal|trend|positions?)\s+([A-Za-z0-9_]+)(?:\s+(\S+))?$/i
  );
  if (structured) {
    const coin = structured[1].toUpperCase();
    const positionAge = structured[2]
      ? parsePositionAgeToken(structured[2]) ?? resolvePositionAge(null, trimmed)
      : resolvePositionAge(null, trimmed);
    const action: AgentAction = /^trend\b/i.test(trimmed)
      ? 'signal_trend'
      : /^positions?\b/i.test(trimmed)
        ? 'positions'
        : 'signal_snapshot';
    return { ...DEFAULT_AGENT_INTENT, coin, action, depth: 'full', positionAge };
  }

  return null;
}

function extractNaturalLanguageHeuristic(
  query: string,
  context?: ChatContext | null
): AgentIntent | null {
  const coin = extractCoinHeuristic(query);
  if (!coin) return null;

  const action = inferActionFromQuery(query);
  if (action === 'composite') return null;

  const trimmed = query.trim();
  const wantsTrend = /\b(trend|momentum|akumulasi|distribusi|arah)\b/i.test(trimmed);
  const wantsPositions = /\b(posisi|positions?|entry|dominasi|harga|masuk|liquidat)\b/i.test(
    trimmed
  );
  const wantsSignal =
    /\b(signal|bias|sentimen|sentiment)\b/i.test(trimmed) ||
    (/\bwhale\b/i.test(trimmed) && !wantsPositions);

  const hasClearIntent =
    (wantsPositions && !wantsTrend && !wantsSignal) ||
    (wantsTrend && !wantsPositions) ||
    (wantsSignal && !wantsTrend && !wantsPositions);

  if (!hasClearIntent) return null;

  return {
    coin,
    action,
    depth: detectBriefDepth(trimmed, 'full'),
    cohortFocus: 'all',
    positionAge: resolvePositionAge(null, query, context),
  };
}

function inferActionFromQuery(query: string): AgentAction {
  const briefing = /\b(briefing|overview|gambaran\s+keseluruhan|gambaran\s+lengkap)\b/i.test(
    query
  );
  if (briefing) return 'composite';

  const wantsEntry = /\b(entry|harga|masuk|liquidat|dominasi|positions?|posisi)\b/i.test(
    query
  );
  const wantsTrend = /\b(trend|momentum|akumulasi|distribusi|accumulate|arah)\b/i.test(query);
  const wantsBias =
    /\b(bias|sentimen|sentiment|signal)\b/i.test(query) ||
    /\b(posisi|position)\s+whale\b/i.test(query) ||
    (/\bwhale\b/i.test(query) && !wantsEntry);

  const aspectCount = [wantsEntry, wantsTrend, wantsBias].filter(Boolean).length;
  if (aspectCount >= 2) return 'composite';

  if (wantsTrend && !wantsEntry) return 'signal_trend';
  if (wantsEntry && !wantsTrend && !wantsBias) return 'positions';
  if (wantsBias) return 'signal_snapshot';
  return 'signal_snapshot';
}

function extractCompositeHeuristic(
  query: string,
  context?: ChatContext | null
): AgentIntent | null {
  const briefing = /\b(briefing|overview|gambaran\s+keseluruhan|gambaran\s+lengkap)\b/i.test(
    query
  );

  const wantsEntry = /\b(entry|harga|masuk|liquidat|dominasi|positions?|posisi)\b/i.test(
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
    positionAge: resolvePositionAge(null, query, context),
    aspects: uniqueAspects.length >= 2 ? uniqueAspects : ['signal', 'positions'],
  };
}

function extractCoinHeuristic(query: string): string | null {
  const matches = query.toUpperCase().match(/\b[A-Z][A-Z0-9]{1,7}\b/g) ?? [];
  const candidates = matches.filter((t) => !COIN_STOP_WORDS.has(t));
  if (!candidates.length) return null;

  const known = candidates.filter((t) => KNOWN_TICKERS.has(t));
  if (known.length) return known[known.length - 1];

  return candidates[candidates.length - 1];
}

function resolveCoin(
  llmCoin: string | null | undefined,
  query: string,
  context?: ChatContext | null
): string | null {
  const fromLlm = llmCoin?.trim().toUpperCase();
  if (fromLlm && !COIN_STOP_WORDS.has(fromLlm) && KNOWN_TICKERS.has(fromLlm)) {
    return fromLlm;
  }

  const fromQuery = extractCoinHeuristic(query);
  if (fromQuery) return fromQuery;

  if (fromLlm && !COIN_STOP_WORDS.has(fromLlm)) return fromLlm;

  if (context?.lastCoin) return context.lastCoin;

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

function normalizePositionAge(value: string | undefined): PositionAge | null {
  if (value === 'all' || value === '24h' || value === '7d' || value === '30d') {
    return value;
  }
  return null;
}
