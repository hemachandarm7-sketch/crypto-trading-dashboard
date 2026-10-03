export type Direction = 'LONG' | 'SHORT'
export type TradeStatus = 'OPEN' | 'CLOSED'
export type CloseReason = 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE' | 'UNKNOWN'
export type ScreenshotType = 'OPEN_TRANSACTION' | 'CLOSE_TRANSACTION' | 'PNL' | 'POSITION_DETAILS' | 'UNKNOWN'
export type ExtractionStatus = 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'MATCHED' | 'COMPLETED' | 'FAILED'
export type ExtractionFieldSource = 'direct_ocr' | 'calculated' | 'estimated' | 'user_corrected'
export interface ExtractionFieldProvenance {
  source: ExtractionFieldSource
  formula?: string
  inputs?: Record<string, number | string | null>
  requiresConfirmation?: boolean
}

export interface Trade {
  id: string
  symbol: string
  exchange: string | null
  marketType: string | null
  direction: Direction | null
  leverage: number | null
  quantity: number | null
  size: number | null
  margin: number | null
  avgEntry: number | null
  ltp: number | null
  liquidationPrice: number | null
  takeProfit: number | null
  stopLoss: number | null
  openTime: string | null
  closeTime: string | null
  holdingDurationSeconds: number | null
  holdingDurationDisplay: string | null
  closePrice: number | null
  pnlAmount: number | null
  pnlPercentage: number | null
  status: TradeStatus
  closeReason: CloseReason | null
  setup: string | null
  notes: string | null
  exchangePositionId: string | null
  openTransactionId: string | null
  closeTransactionId: string | null
  createdAt: string
  updatedAt: string
}

export interface ExtractedTradeData {
  screenshotType: ScreenshotType
  symbol?: string | null
  direction?: Direction | null
  eventTime?: string | null
  transactionPrice?: number | null
  closePrice?: number | null
  closeNotional?: number | null
  leverage?: number | null
  quantity?: number | null
  size?: number | null
  margin?: number | null
  avgEntry?: number | null
  ltp?: number | null
  liquidationPrice?: number | null
  takeProfit?: number | null
  stopLoss?: number | null
  pnlAmount?: number | null
  grossPnlAmount?: number | null
  feeAmount?: number | null
  entryNotional?: number | null
  pnlPercentage?: number | null
  transactionId?: string
  positionId?: string
  exchange?: string
  marketType?: string
  marginMode?: 'ISOLATED' | 'CROSS'
  rawText?: string
  confidence?: number | null
  fieldProvenance?: Record<string, ExtractionFieldProvenance>
  fieldCurrencies?: Partial<Record<import('../utils/currency').MonetaryField, import('../utils/currency').CurrencyCode>>
  currencyAudit?: import('../utils/currency').CurrencyAudit
}

export interface Screenshot {
  id: string
  tradeId: string | null
  storagePath: string
  screenshotType: ScreenshotType
  uploadedAt: string
  extractedAt: string | null
  extractionStatus: ExtractionStatus
  extractionRawData: Record<string, unknown> | null
  extractionConfidence: number | null
  sha256: string
  originalName: string
  contentType: string
  sizeBytes: number
  previewUrl?: string
}

export type TradeEventType = 'OPEN' | 'CLOSE' | 'PNL' | 'POSITION_DETAILS'
export interface TradeEvent {
  id: string
  tradeId: string
  eventType: TradeEventType
  eventTime: string | null
  price: number | null
  percentage: number | null
  rawData: Record<string, unknown>
  screenshotId: string | null
  createdAt: string
}

export interface AnalyticsSummary {
  totalPnl: number
  totalProfit: number
  totalLoss: number
  winRate: number
  lossRate: number
  averageProfit: number
  averageLoss: number
  profitFactor: number
  averagePnlPercentage: number | null
  maxDrawdown: number
  totalInvestment: number
  totalTrades: number
  openTrades: number
  closedTrades: number
  tpHits: number
  slHits: number
  manualClosures: number
  averageHoldingTimeSeconds: number | null
}

export interface UserSettings {
  defaultLeverage: number
  defaultExchange: string
  defaultMarket: string
  currency: string
  theme: 'dark' | 'light'
  defaultRange: string
  analyticsView: string
}
