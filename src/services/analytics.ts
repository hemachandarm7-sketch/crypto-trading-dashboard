import type { AnalyticsSummary, Trade } from '../types'

/**
 * Classify trade outcome based on actual PNL, not exit method (closeReason)
 * Returns: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'LIQUIDATION'
 */
export function classifyTradeOutcome(trade: Trade): 'WIN' | 'LOSS' | 'BREAKEVEN' | 'LIQUIDATION' {
  if (trade.status === 'LIQUIDATED') return 'LIQUIDATION'
  if (trade.pnlAmount === null) return 'BREAKEVEN' // Missing PNL treated as breakeven
  if (trade.pnlAmount > 0) return 'WIN'
  if (trade.pnlAmount < 0) return 'LOSS'
  return 'BREAKEVEN' // pnlAmount === 0
}

export function getRealizedPnl(trades: Trade[]): number {
  return trades.filter(trade => trade.status === 'CLOSED' && trade.pnlAmount != null).reduce((sum, trade) => sum + trade.pnlAmount!, 0)
}

export function getAnalytics(trades: Trade[]): AnalyticsSummary {
  const closed = trades.filter(trade => trade.status === 'CLOSED' || trade.status === 'LIQUIDATED')
  const liquidated = trades.filter(trade => trade.status === 'LIQUIDATED')
  const known = closed.filter((trade): trade is Trade & { pnlAmount: number } => trade.pnlAmount != null)
  const profits = known.map(trade => trade.pnlAmount).filter(pnl => pnl > 0)
  const losses = known.map(trade => trade.pnlAmount).filter(pnl => pnl < 0)
  const totalProfit = profits.reduce((sum, pnl) => sum + pnl, 0)
  const totalLoss = Math.abs(losses.reduce((sum, pnl) => sum + pnl, 0))
  
  // ✅ Calculate liquidation loss separately
  const liquidationLoss = liquidated.reduce((sum, trade) => sum + Math.abs(trade.pnlAmount ?? 0), 0)
  
  // ✅ NEW: Count outcomes by PNL + exit reason combination
  const profitableWithTp = closed.filter(trade => classifyTradeOutcome(trade) === 'WIN' && trade.status === 'CLOSED' && trade.closeReason === 'TP_HIT').length
  const losingWithSl = closed.filter(trade => classifyTradeOutcome(trade) === 'LOSS' && trade.status === 'CLOSED' && trade.closeReason === 'SL_HIT').length
  const profitableManual = closed.filter(trade => classifyTradeOutcome(trade) === 'WIN' && trade.closeReason === 'MANUAL_CLOSE').length
  const losingManual = closed.filter(trade => classifyTradeOutcome(trade) === 'LOSS' && trade.closeReason === 'MANUAL_CLOSE').length
  const breakEvenCount = closed.filter(trade => classifyTradeOutcome(trade) === 'BREAKEVEN').length
  
  const percentages = closed.map(trade => trade.pnlPercentage).filter((value): value is number => value != null)
  const holdingTimes = closed.map(trade => trade.holdingDurationSeconds).filter((value): value is number => value != null)
  let equity = 0, peak = 0, maxDrawdown = 0
  for (const trade of [...known].sort((a, b) => (a.closeTime ?? '').localeCompare(b.closeTime ?? ''))) {
    equity += trade.pnlAmount
    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, peak - equity)
  }
  const investment = trades.map(trade => trade.margin).filter((value): value is number => value != null)
  
  // ✅ FIXED: Count TP hits and SL hits independently, regardless of profitability
  // This allows analysis of whether TP/SL levels are placed correctly
  const tpHitCount = closed.filter(trade => trade.status === 'CLOSED' && trade.closeReason === 'TP_HIT').length
  const slHitCount = closed.filter(trade => trade.status === 'CLOSED' && trade.closeReason === 'SL_HIT').length
  const manualCloseCount = closed.filter(trade => trade.status === 'CLOSED' && trade.closeReason === 'MANUAL_CLOSE').length
  
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
    // ✅ CHANGED: tpHits and slHits now count EXIT METHOD, not outcome
    // To analyze if TP/SL are working, combine with outcome classification
    tpHits: tpHitCount,
    slHits: slHitCount,
    // ✅ REMOVED: manualClosures - this is not a performance outcome
    // Instead track: profitableManual + losingManual (kept in separate fields for backwards compat)
    manualClosures: manualCloseCount, // ⚠️ DEPRECATED - use profitableManual + losingManual instead
    liquidations: liquidated.length,
    liquidationLoss,
    // ✅ NEW: Outcome-based metrics for actual performance analysis
    profitableWithTp, // Winning trades that hit their TP target
    losingWithSl, // Losing trades that hit their SL
    profitableManual, // Winning trades exited manually
    losingManual, // Losing trades exited manually
    breakEvenTrades: breakEvenCount, // Trades with zero profit/loss
    averageHoldingTimeSeconds: holdingTimes.length ? holdingTimes.reduce((sum, value) => sum + value, 0) / holdingTimes.length : null,
  }
}

function closedTradesWithKnownPnl(trades: Trade[]) {
  // ✅ Include both CLOSED and LIQUIDATED trades
  return trades.filter((trade): trade is Trade & { pnlAmount: number } => (trade.status === 'CLOSED' || trade.status === 'LIQUIDATED') && trade.pnlAmount != null)
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
    // ✅ Include both CLOSED and LIQUIDATED trades for accurate direction analysis
    trades: trades.filter(trade => (trade.status === 'CLOSED' || trade.status === 'LIQUIDATED') && trade.direction === direction).length,
  }))
}

export function buildCoinPerformance(trades: Trade[]) {
  // ✅ Include both CLOSED and LIQUIDATED trades for comprehensive coin performance analysis
  const symbols = [...new Set(trades.filter(trade => (trade.status === 'CLOSED' || trade.status === 'LIQUIDATED') && trade.pnlAmount != null).map(trade => trade.symbol))]
  return symbols.map(symbol => ({ symbol, pnl: closedTradesWithKnownPnl(trades).filter(trade => trade.symbol === symbol).reduce((sum, trade) => sum + trade.pnlAmount, 0) }))
}

/**
 * ❌ DEPRECATED: buildCloseReasonPerformance
 * This function is misleading because it counts exit methods, not outcomes
 * A MANUAL_CLOSE could be profitable or losing - this doesn't tell us which
 * 
 * Use buildExitMethodAnalysis() instead to see both exit method AND outcome
 */
export function buildCloseReasonPerformance(trades: Trade[]) {
  // Kept for backward compatibility - shows raw exit method counts
  return (['TP_HIT', 'SL_HIT', 'MANUAL_CLOSE'] as const).map(reason => ({
    reason, count: trades.filter(trade => trade.status === 'CLOSED' && trade.closeReason === reason).length,
  }))
}

/**
 * ✅ NEW: Analyze exit methods with actual outcomes
 * Shows how many TP/SL/manual closes were actually profitable vs losing
 */
export function buildExitMethodOutcomeAnalysis(trades: Trade[]) {
  const closed = trades.filter(trade => trade.status === 'CLOSED')
  return {
    // TP hits - show count AND how many were profitable
    tpHits: {
      total: closed.filter(trade => trade.closeReason === 'TP_HIT').length,
      profitable: closed.filter(trade => trade.closeReason === 'TP_HIT' && classifyTradeOutcome(trade) === 'WIN').length,
      losing: closed.filter(trade => trade.closeReason === 'TP_HIT' && classifyTradeOutcome(trade) === 'LOSS').length,
    },
    // SL hits - show count AND how many were actually losing
    slHits: {
      total: closed.filter(trade => trade.closeReason === 'SL_HIT').length,
      losing: closed.filter(trade => trade.closeReason === 'SL_HIT' && classifyTradeOutcome(trade) === 'LOSS').length,
      profitable: closed.filter(trade => trade.closeReason === 'SL_HIT' && classifyTradeOutcome(trade) === 'WIN').length,
    },
    // Manual closes - separate profitable from losing
    manualCloses: {
      total: closed.filter(trade => trade.closeReason === 'MANUAL_CLOSE').length,
      profitable: closed.filter(trade => trade.closeReason === 'MANUAL_CLOSE' && classifyTradeOutcome(trade) === 'WIN').length,
      losing: closed.filter(trade => trade.closeReason === 'MANUAL_CLOSE' && classifyTradeOutcome(trade) === 'LOSS').length,
      breakeven: closed.filter(trade => trade.closeReason === 'MANUAL_CLOSE' && classifyTradeOutcome(trade) === 'BREAKEVEN').length,
    },
    // Unknown/null close reasons
    unknown: {
      total: closed.filter(trade => !trade.closeReason || trade.closeReason === 'UNKNOWN').length,
      profitable: closed.filter(trade => (!trade.closeReason || trade.closeReason === 'UNKNOWN') && classifyTradeOutcome(trade) === 'WIN').length,
      losing: closed.filter(trade => (!trade.closeReason || trade.closeReason === 'UNKNOWN') && classifyTradeOutcome(trade) === 'LOSS').length,
    },
  }
}
