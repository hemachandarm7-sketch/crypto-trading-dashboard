export type Direction = 'Long' | 'Short'
export type TradeStatus = 'Open' | 'Closed' | 'Cancelled'
export interface Trade {
  id: string; date: string; symbol: string; exchange: string; market: string; direction: Direction
  entryPrice: number; exitPrice?: number; quantity: number; leverage: number; investment: number
  stopLoss?: number; takeProfit?: number; averageEntry?: number; liquidationPrice?: number
  exitDate?: string; pnl?: number; pnlPercent?: number; status: TradeStatus; setup: string; notes: string
  currentPrice?: number
}
export type Position = Trade & { status: 'Open'; currentPrice: number }
export interface Screenshot { id: string; name: string; type: string; size: number; addedAt: string; tradeId?: string; previewUrl: string }
export interface AnalyticsSummary { totalPnl: number; winRate: number; lossRate: number; profitFactor: number; averageWin: number; averageLoss: number; riskReward: number; maxDrawdown: number }
export interface UserSettings { defaultLeverage: number; defaultExchange: string; defaultMarket: string; currency: string; theme: 'dark' | 'light'; defaultRange: string; analyticsView: string }
