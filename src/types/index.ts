// --- HyperTracker API Types ---

export type CohortId =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16;

export type PositionAge = 'all' | '24h' | '7d' | '30d';

export interface PositionMetricSnapshot {
  createdAt: string;
  coin: string;
  segmentId: CohortId;
  positionCount: number;
  positionCountLong: number;
  totalPositionValue: number;
  totalPositionValueLong: number;
  totalFunding: number;
  totalUnrealizedPnl: number;
  totalPositionSize: number;
  totalPositionSizeLong: number;
}

export interface PositionMetricsResponse {
  metrics: PositionMetricSnapshot[];
  nextCursor?: string;
}

export interface BiasMetricRow {
  positionCount: number;
  positionCountLong: number;
  totalPositionValue: number;
  totalPositionValueLong: number;
  bias: number;
  timestamp: string;
}

export type BiasExportWindow =
  | 'segment-metrics'
  | 'segment-metrics-24h'
  | 'segment-metrics-7d'
  | 'segment-metrics-30d';

export interface BiasExportSegment {
  segment: {
    id: CohortId;
    name: string;
    emoji: string;
    category: 'size' | 'pnl';
    criteria?: {
      minSize?: number;
      maxSize?: number;
      minPnl?: number;
      maxPnl?: number;
    };
  };
  metrics: {
    columns: string[];
    data: (number | string)[][];
  };
}

export interface BiasExportResponse {
  coin: string;
  data: BiasExportSegment[];
}

export interface LeaderboardEntry {
  address: string;
  age: string;
  totalValue: number;
  pnlDay: number;
  pnlWeek: number;
  pnlMonth: number;
  pnlAllTime: number;
  rank: number;
  profile: {
    displayName: string | null;
    emoji: string | null;
    verified: boolean;
    segments: CohortId[];
    favoriteCount: number;
    totalEquity: number;
    perpPnl: number;
  };
}

// --- Agent Internal Types ---

export interface ParsedIntent {
  coin: string;
  cohortFocus: 'whale' | 'smart_money' | 'all';
  mode: 'snapshot' | 'trend' | 'leaderboard';
  positionAge: PositionAge;
}

export interface CohortSignal {
  cohortId: CohortId;
  cohortName: string;
  emoji: string;
  bias: number;
  direction: 'strong_long' | 'mild_long' | 'neutral' | 'mild_short' | 'strong_short';
  unrealizedPnlRatio: number;
  isStalePosition: boolean;
  longValue: number;
  shortValue: number;
  totalPositionValue: number;
  totalUnrealizedPnl: number;
  tradersInPosition: number;
}

export interface CohortTrendSummary {
  cohortId: CohortId;
  cohortName: string;
  emoji: string;
  latestBias: number;
  trend: TrendSignal;
}

export interface DivergenceSignal {
  detected: boolean;
  type: 'smart_vs_retail' | 'size_vs_pnl' | 'none';
  description: string;
  smartMoneyDirection: 'long' | 'short' | 'neutral';
  retailDirection: 'long' | 'short' | 'neutral';
}

export interface TrendSignal {
  direction: 'accumulating' | 'distributing' | 'stable' | 'insufficient_data';
  biasShift: number;
  startTimestamp: string;
  latestTimestamp: string;
  description: string;
}

export interface AgentSignalResult {
  coin: string;
  timestamp: string;
  mode: 'snapshot' | 'trend';
  cohortSignals: CohortSignal[];
  cohortTrends: CohortTrendSummary[];
  netBias: number;
  netDirection: CohortSignal['direction'];
  divergence: DivergenceSignal;
  trend: TrendSignal;
  overallSentiment: 'bullish' | 'bearish' | 'neutral' | 'conflicted';
  staleWarning: boolean;
  rawSummary: string;
}

export interface RunAgentOptions {
  cohortFocus?: ParsedIntent['cohortFocus'];
  mode?: ParsedIntent['mode'];
}
