import type { AnalyticsSummary, Trade } from '../types'

export function getRealizedPnl(trades: Trade[]): number {
  return trades.filter(trade => trade.status === 'CLOSED' && trade.pnlAmount != null).reduce((sum, trade) => sum + trade.pnlAmount!, 0)
}

export function getAnalytics(trades: Trade[]): AnalyticsSummary {
  const closed = trades.filter(trade => trade.status === 'CLOSED')
  const known = closed.filter((trade): trade is Trade & { pnlAmount: number } => trade.pnlAmount != null)
  const profits = known.map(trade => trade.pnlAmount).filter(pnl => pnl > 0)
  const losses = known.map(trade => trade.pnlAmount).filter(pnl => pnl < 0)
  const totalProfit = profits.reduce((sum, pnl) => sum + pnl, 0)
  const totalLoss = Math.abs(losses.reduce((sum, pnl) => sum + pnl, 0))
  const percentages = closed.map(trade => trade.pnlPercentage).filter((value): value is number => value != null)
  const holdingTimes = closed.map(trade => trade.holdingDurationSeconds).filter((value): value is number => value != null)
  let equity = 0, peak = 0, maxDrawdown = 0
  for (const trade of [...known].sort((a, b) => (a.closeTime ?? '').localeCompare(b.closeTime ?? ''))) {
    equity += trade.pnlAmount
    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, peak - equity)
  }
  const investment = trades.map(trade => trade.margin).filter((value): value is number => value != null)
  return {
    totalPnl: totalProfit - totalLoss, totalProfit, totalLoss,
    winRate: known.length ? profits.length / known.length * 100 : 0,
    lossRate: known.length ? losses.length / known.length * 100 : 0,
    averageProfit: profits.length ? totalProfit / profits.length : 0,
    averageLoss: losses.length ? -totalLoss / losses.length : 0,
    profitFactor: totalLoss ? totalProfit / totalLoss : totalProfit ? Infinity : 0,
    averagePnlPercentage: percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null,
    maxDrawdown, totalInvestment: investment.reduce((sum, value) => sum + value, 0),
    totalTrades: trades.length, openTrades: trades.filter(trade => trade.status === 'OPEN').length,
    closedTrades: closed.length,
    tpHits: closed.filter(trade => trade.closeReason === 'TP_HIT').length,
    slHits: closed.filter(trade => trade.closeReason === 'SL_HIT').length,
    manualClosures: closed.filter(trade => trade.closeReason === 'MANUAL_CLOSE').length,
    averageHoldingTimeSeconds: holdingTimes.length ? holdingTimes.reduce((sum, value) => sum + value, 0) / holdingTimes.length : null,
  }
}

function closedTradesWithKnownPnl(trades: Trade[]) {
  return trades.filter((trade): trade is Trade & { pnlAmount: number } => trade.status === 'CLOSED' && trade.pnlAmount != null)
}

export function buildEquityCurve(trades: Trade[]) {
  let equity = 0
  return closedTradesWithKnownPnl(trades).sort((a, b) => (a.closeTime ?? '').localeCompare(b.closeTime ?? '')).map(trade => ({
    date: trade.closeTime?.slice(0, 10) ?? trade.openTime?.slice(0, 10) ?? '',
    equity: Math.round((equity += trade.pnlAmount) * 100) / 100,
    pnl: trade.pnlAmount,
    tradeId: trade.id,
  }))
}

function weekStart(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)
  const day = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - day)
  return date.toISOString().slice(0, 10)
}

export function buildPnlBuckets(trades: Trade[], unit: 'day' | 'week' | 'month' | 'year') {
  const buckets = new Map<string, number>()
  for (const trade of closedTradesWithKnownPnl(trades)) {
    const date = trade.closeTime?.slice(0, 10)
    if (!date) continue
    const key = unit === 'year' ? date.slice(0, 4) : unit === 'month' ? date.slice(0, 7) : unit === 'week' ? weekStart(date) : date
    buckets.set(key, (buckets.get(key) ?? 0) + trade.pnlAmount)
  }
  return [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([date, pnl]) => ({ date, pnl }))
}

export function buildDirectionPerformance(trades: Trade[]) {
  return (['LONG', 'SHORT'] as const).map(direction => ({
    direction,
    pnl: closedTradesWithKnownPnl(trades).filter(trade => trade.direction === direction).reduce((sum, trade) => sum + trade.pnlAmount, 0),
    trades: trades.filter(trade => trade.status === 'CLOSED' && trade.direction === direction).length,
  }))
}

export function buildCoinPerformance(trades: Trade[]) {
  const symbols = [...new Set(trades.filter(trade => trade.status === 'CLOSED' && trade.pnlAmount != null).map(trade => trade.symbol))]
  return symbols.map(symbol => ({ symbol, pnl: closedTradesWithKnownPnl(trades).filter(trade => trade.symbol === symbol).reduce((sum, trade) => sum + trade.pnlAmount, 0) }))
}

export function buildCloseReasonPerformance(trades: Trade[]) {
  return (['TP_HIT', 'SL_HIT', 'MANUAL_CLOSE'] as const).map(reason => ({
    reason, count: trades.filter(trade => trade.status === 'CLOSED' && trade.closeReason === reason).length,
  }))
}
