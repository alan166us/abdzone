export interface Candle {
  time: number;
  dateStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ZoneType = 'demand' | 'supply';

export type ZonePattern =
  | 'DBR'
  | 'RBR'
  | 'RBD'
  | 'DBD';

export type ZoneStatus = 'fresh' | 'tested' | 'weakened' | 'mitigated';

export type ProximityPhase =
  | 'Phase A: Staging (1.0–1.5x ATR)'
  | 'Phase B: Zone Touch (Execute)'
  | 'Phase C: In-Play (3-Bar Rule)'
  | 'Dormant (>1.5x ATR)';

export interface SupplyDemandZone {
  id: string;
  type: ZoneType;
  pattern: ZonePattern;
  high: number;
  low: number;
  equilibrium: number;
  proximalLine: number;
  distalLine: number;
  startIndex: number;
  endIndex: number;
  startTime: number;
  departureVelocity: number;
  departurePercent: number;
  strengthScore: number;
  testedCount: number;
  isDepleted: boolean;
  isMitigated: boolean;
  mitigatedIndex?: number;
  mitigatedTime?: number;
  volatilityAtCreation: number;
  baseLength: number;
  volumeImbalanceRatio?: number;
  trendConfluence?: 'pro-trend' | 'counter-trend' | 'neutral';
  conservativeEntry?: number;
  confluenceTags?: string[];
  vwapConfluence?: { scoreBonus: number; tag: string };
  vwapAtFormation?: number;
  heuristicQualityScore?: number;
  barAge?: number;
  proximityPhase?: ProximityPhase;
  distanceInAtr?: number;
  isRecentPrimary?: boolean;
  notes: string;
}

export interface VolatilityMetrics {
  atr: number;
  atrPercent: number;
  annualizedHV: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  regime: 'Compression (Squeeze)' | 'Normal' | 'Expansion (High Volatility)' | 'Extreme Impulse';
  recommendedBufferMultiplier: number;
}

export interface TradeRecommendation {
  id: string;
  zoneId: string;
  symbol: string;
  side: 'long' | 'short';
  zoneType: ZoneType;
  pattern: ZonePattern;
  entry: number;
  conservativeEntry: number;
  entryType: 'Zone Boundary' | '50% Equilibrium' | 'Rejection Confirmation';
  stopLoss: number;
  bufferAtrMultiplier: number;
  bufferAmount: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskPerUnit: number;
  rewardPerUnit1: number;
  rewardPerUnit2: number;
  rewardPerUnit3: number;
  riskRewardRatio: number;
  status: 'active' | 'triggered' | 'won' | 'stopped_out' | 'invalidated';
  heuristicQualityScore: number;
  qualityScore: number;
  rationale: string;
  currentDistancePercent: number;
  distanceInAtr?: number;
  proximityPhase?: ProximityPhase;
  opposingZoneId?: string;
  vwapConfluence?: { scoreBonus: number; tag: string };
  /** fresh = recent-only zones; historical-fallback = relaxation path */
  recommendationSource?: 'fresh' | 'historical-fallback';
  executionMode?: 'Execution Mode: Rejection Confirmation' | string;
}

export interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialBalance: number;
  riskPercent: number;
  targetMode: 'tp1' | 'tp2' | 'tp3';
  atrBufferMultiplier: number;
  minQualityScore: number;
  sideFilter: 'all' | 'long' | 'short';
  freshOnly: boolean;
  dataSource?: string;
}

export interface EquityPoint {
  time: number;
  dateStr: string;
  equity: number;
  drawdownPercent: number;
  tradeIndex?: number;
  outcome?: 'win' | 'loss' | 'neutral';
}

export interface BacktestTrade {
  id: string;
  zoneId: string;
  zoneType: ZoneType;
  pattern: ZonePattern;
  entryIndex: number;
  entryTime: number;
  entryDateStr: string;
  entryPrice: number;
  exitIndex: number;
  exitTime: number;
  exitDateStr: string;
  exitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  bufferAmount: number;
  side: 'long' | 'short';
  outcome: 'tp1' | 'tp2' | 'tp3' | 'sl' | 'open';
  rMultiple: number;
  pnlPercent: number;
  pnlDollar: number;
  balanceAfter: number;
  barsHeld: number;
  qualityScore: number;
}

export interface BacktestSummary {
  config: BacktestConfig;
  totalCandlesInRange: number;
  startDate: string;
  endDate: string;
  initialBalance: number;
  endingBalance: number;
  netProfitDollar: number;
  netProfitPercent: number;
  totalTrades: number;
  wins: number;
  losses: number;
  openTrades: number;
  winRate: number;
  profitFactor: number;
  avgRMultiple: number;
  maxDrawdownDollar: number;
  maxDrawdownPercent: number;
  avgWinDollar: number;
  avgLossDollar: number;
  longestWinStreak: number;
  longestLossStreak: number;
  longWinRate: number;
  shortWinRate: number;
  disclaimer?: string;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
}

export interface AssetPreset {
  id: string;
  symbol: string;
  name: string;
  category: 'Crypto' | 'Equity' | 'Forex' | 'Commodity';
  defaultTimeframe: string;
  precision: number;
  tickSize: number;
}

export interface SchwabOptionTrade {
  id: string;
  date: string;
  underlying: string;
  optionSymbol: string;
  strike: number;
  type: 'CALL' | 'PUT';
  expiration: string;
  action: 'Buy to Open' | 'Sell to Close' | 'Sell to Open' | 'Buy to Close' | 'Expired' | 'Assigned' | 'Trade';
  contracts: number;
  entryPrice: number;
  exitPrice?: number;
  entryDate?: string;
  exitDate?: string;
  commission: number;
  netProceeds: number;
  realizedPnL?: number;
  roiPercent?: number;
  status: 'closed' | 'open';
  description: string;
}

export interface SchwabOptionPerformance {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalNetPnL: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
}

export type JournalOutcome = 'Win' | 'Loss' | 'Breakeven' | 'Open';

export interface JournalTrade {
  id: string;
  timestamp: number;
  dateStr: string;
  symbol: string;
  side: 'long' | 'short';
  zoneId: string;
  zoneType: ZoneType;
  pattern: ZonePattern;
  instrumentType: 'OPTION' | 'STOCK' | 'FUTURE';
  optionSymbol?: string;
  strike?: number;
  optionType?: 'CALL' | 'PUT';
  contracts: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  exitPrice?: number;
  exitDateStr?: string;
  outcome: JournalOutcome;
  rMultiple: number;
  pnlDollar: number;
  pnlPercent: number;
  qualityScore: number;
  executionSource: 'Schwab Portal' | 'thinkorswim' | 'Simulated' | 'Manual';
  notes?: string;
}

export interface PatternPerformance {
  pattern: ZonePattern;
  zoneType: ZoneType;
  totalTrades: number;
  wins: number;
  losses: number;
  openTrades: number;
  winRate: number;
  totalPnLDollar: number;
  profitFactor: number;
  avgRMultiple: number;
  avgWinDollar: number;
  avgLossDollar: number;
  bestTradeDollar: number;
}

export type MonitorTriggerStatus = 'IN_ZONE' | 'APPROACHING' | 'MONITORING';

export interface MonitoredOpportunity {
  symbol: string;
  name: string;
  category: 'Future' | 'Optionable Stock' | 'Index / ETF';
  currentPrice: number;
  priceChange: number;
  changePercent: number;
  status: MonitorTriggerStatus;
  signalType: 'CALL / LONG' | 'PUT / SHORT' | 'NEUTRAL';
  triggerAction: string;
  nearestZone?: SupplyDemandZone;
  distancePercent: number;
  distanceDollars: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  rMultiple: number;
  qualityScore: number;
  wholesalerVolumeRatio?: number;
  lastUpdated: string;
  optionStrike?: number;
  optionExp?: string;
  optionTosExp?: string;
  optionDotSymbol?: string;
  optionPremium?: number;
}

export interface OpportunityAlert {
  id: string;
  timestamp: number;
  timeStr: string;
  symbol: string;
  type: 'IN_ZONE' | 'APPROACHING';
  signal: 'CALL' | 'PUT' | 'FUTURE_LONG' | 'FUTURE_SHORT';
  message: string;
  strike?: number;
  zoneId: string;
  pattern: ZonePattern;
  currentPrice: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  rMultiple: number;
}
