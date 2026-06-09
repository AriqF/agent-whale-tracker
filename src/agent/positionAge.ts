import type { ChatContext, PositionAge } from '../types';

export const DEFAULT_POSITION_AGE: PositionAge = '24h';

const TOKEN_MAP: Record<string, PositionAge> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  all: 'all',
  intraday: '24h',
  scalping: '24h',
  scalp: '24h',
  swing: '7d',
  weekly: '7d',
  monthly: '30d',
  macro: '30d',
};

export function parsePositionAgeToken(token: string): PositionAge | null {
  const key = token.trim().toLowerCase();
  if (TOKEN_MAP[key]) return TOKEN_MAP[key];
  if (/^24\s*h(?:ours?)?$/i.test(key) || key === '1d') return '24h';
  if (/^7\s*(?:d|days?|hari)$/i.test(key)) return '7d';
  if (/^30\s*(?:d|days?|hari)$/i.test(key)) return '30d';
  return null;
}

export function detectPositionAgeFromQuery(query: string): PositionAge | null {
  const explicit = query.match(/\b(24h|7d|30d|1d)\b/i);
  if (explicit) {
    const parsed = parsePositionAgeToken(explicit[1]);
    if (parsed) return parsed;
  }

  if (/\b(7\s*hari|minggu|weekly|swing)\b/i.test(query)) return '7d';
  if (/\b(30\s*hari|bulan|monthly|long[\s-]?term|macro)\b/i.test(query)) return '30d';
  if (/\b(all[\s-]?time|keseluruhan)\b/i.test(query)) return 'all';
  if (/\b(scalping|intraday|short[\s-]?term|hari\s*ini)\b/i.test(query)) return '24h';

  return null;
}

export function resolvePositionAge(
  explicit?: PositionAge | null,
  query?: string,
  context?: ChatContext | null
): PositionAge {
  if (query) {
    const fromQuery = detectPositionAgeFromQuery(query);
    if (fromQuery) return fromQuery;
  }
  if (explicit) return explicit;
  if (context?.lastPositionAge) return context.lastPositionAge;
  return DEFAULT_POSITION_AGE;
}

export function positionAgeLabel(age: PositionAge): string {
  const map: Record<PositionAge, string> = {
    '24h': '24 jam',
    '7d': '7 hari',
    '30d': '30 hari',
    all: 'all-time',
  };
  return map[age];
}

export function contextPositionAge(context: ChatContext | null | undefined): PositionAge {
  return context?.lastPositionAge ?? DEFAULT_POSITION_AGE;
}
