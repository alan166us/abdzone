export interface Candle {
  time: number;          // timestamp in milliseconds
  dateStr: string;       // formatted date/time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ZoneType = 'demand' | 'supply';

export type ZonePattern = 
  | 'DBR' // Drop-Base-Rally (Reversal Demand)
  | 'RBR' // Rally-Base-Rally (Continuation Demand)
  | 'RBD' // Rally-Base-Drop (Reversal Supply)
  | 'DBD'; // Drop-Base-Drop (Continuation Supply)

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
  high: number;           // Upper boundary
  low: number;            // Lower boundary
  equilibrium: number;    // 50% midpoint
  proximalLine: number;   // Outer boundary facing market price (Entry level)
  distalLine: number;     // Inner boundary away from market price (Hard stop anchor)
  startIndex: number;     // Index in candle array where base was formed
  endIndex: number;       // Index where explosive impulse started
  startTime: number;
  departureVelocity: number; // Multiplier of ATR (>= 1.5x required)
  departurePercent: number;  // % price moved away in impulse
  strengthScore: number;  // 0 - 100 quality score
  testedCount: number;    // How many times price tested this zone
  isDepleted: boolean;    // >= 2 tests means high breakout risk
  isMitigated: boolean;   // True if candle closed through or breached distal
  mitigatedIndex?: number;
  mitigatedTime?: number;
  volatilityAtCreation: number; // ATR at the time zone was detected
  baseLength: number;     // Number of candles in base (1-4 max)
  volumeImbalanceRatio?: number; // Multiple of 20-period avg volume on departure (>= 1.3x)
  trendConfluence?: 'pro-trend' | 'counter-trend' | 'neutral';
  conservativeEntry?: number; // 50% zone equilibrium level for enhanced 4:1+ R:R
  confluenceTags?: string[]; // e.g. ['Pro-Trend 20/50 EMA', 'Fresh 0-Test', 'Wholesale Volume Imbalance']
  vwapConfluence?: { scoreBonus: number; tag: string };
  vwapAtFormation?: number; // Active session VWAP stamped at base formation
  heuristicQualityScore?: number; // Transparent 0-100 quality score
  barAge?: number;        // Age in candles since zone formation
  proximityPhase?: ProximityPhase;
  distanceInAtr?: number;
  isRecentPrimary?: boolean; // True for the single most recent active zone of this type
  notes: string;
}

export interface VolatilityMetrics {
  atr: number;
  atrPercent: number;
  annualizedHV: number; // Historical Volatility (standard deviation of log returns * sqrt(252))
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number; // (Upper - Lower) / Middle * 100
  regime: 'Compression (Squeeze)' | 'Normal' | 'Expansion (High Volatility)' | 'Extreme Impulse';
  recommendedBufferMultiplier: number; // 1.2 to 1.8x ATR (default 1.35x)
}

export interface TradeRecommendation {
  id: string;
  zoneId: string;
  symbol: string;
  side: 'long' | 'short';
  zoneType: ZoneType;
  pattern: ZonePattern;
  entry: number;           // Aggressive Proximal Line Entry
  conservativeEntry: number; // Conservative 50% Midline Equilibrium Entry
  entryType: 'Zone Boundary' | '50% Equilibrium';
  stopLoss: number;        // Distal Line ± 1.35x ATR
  bufferAtrMultiplier: number; // Default 1.35x
  bufferAmount: number;
  takeProfit1: number;     // 1:2 R:R (de-risk partials)
  takeProfit2: number;     // Opposing Structural Zone Proximal Line (1:3 to 1:4.5 R:R)
  takeProfit3: number;     // Extended runner
  riskPerUnit: number;
  rewardPerUnit1: number;
  rewardPerUnit2: number;
  rewardPerUnit3: number;
  riskRewardRatio: number;
  status: 'active' | 'triggered' | 'won' | 'stopped_out' | 'invalidated';
  heuristicQualityScore: number; // Transparent 0-100 quality score (Freshness + Velocity + Volume + VWAP)
  qualityScore: number; // Kept for interface backward compatibility
  rationale: string;
  currentDistancePercent: number;
  distanceInAtr?: number;
  proximityPhase?: ProximityPhase;
  opposingZoneId?: string;
  vwapConfluence?: { scoreBonus: number; tag: string };
}

export interface BacktestConfig {
  startDate: string; // YYYY-MM-DD or ISO
  endDate: string;
  initialBalance: number;
  riskPercent: number;
  targetMode: 'tp1' | 'tp2' | 'tp3';
  atrBufferMultiplier: number;
  minQualityScore: number;
  sideFilter: 'all' | 'long' | 'short';
  freshOnly: boolean;
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
  rMultiple: number; // e.g. +2.0, +3.0, -1.0
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
  winRate: number; // 0 - 100%
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
  zoneId: string; // Specific supply/demand zone ID
  zoneType: ZoneType;
  pattern: ZonePattern; // 'DBR' | 'RBR' | 'RBD' | 'DBD'
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
  rMultiple: number; // e.g. +3.0R or -1.0R
  pnlDollar: number; // Dollar profit or loss
  pnlPercent: number; // Percentage gain/loss
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
  winRate: number; // 0 - 100%
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
  triggerAction: string; // e.g. "BUY 575 CALL" or "SELL FUTURE /MES"
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



