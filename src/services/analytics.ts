import type { AnalyticsSummary, Trade } from '../types'

export function getRealizedPnl(trades: Trade[]) { return trades.filter(t => t.status === 'Closed').reduce((sum, t) => sum + (t.pnl ?? 0), 0) }
export function getUnrealizedPnl(trades: Trade[]) {
  return trades.filter(t => t.status === 'Open').reduce((sum, t) => {
    const price = t.currentPrice ?? t.entryPrice
    return sum + (t.direction === 'Long' ? price - t.entryPrice : t.entryPrice - price) * t.quantity
  }, 0)
}
export function getAnalytics(trades: Trade[]): AnalyticsSummary {
  const closed = trades.filter(t => t.status === 'Closed')
  const wins = closed.map(t => t.pnl ?? 0).filter(p => p > 0)
  const losses = closed.map(t => t.pnl ?? 0).filter(p => p < 0)
  const grossWin = wins.reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
  return { totalPnl: grossWin - grossLoss, winRate: closed.length ? wins.length / closed.length * 100 : 0, lossRate: closed.length ? losses.length / closed.length * 100 : 0, profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0, averageWin: wins.length ? grossWin / wins.length : 0, averageLoss: losses.length ? -grossLoss / losses.length : 0, riskReward: losses.length && wins.length ? (grossWin / wins.length) / (grossLoss / losses.length) : 0, maxDrawdown: getMaxDrawdown(closed) }
}
function getMaxDrawdown(trades: Trade[]) {
  let equity = 0, peak = 0, drawdown = 0
  for (const trade of [...trades].sort((a, b) => a.date.localeCompare(b.date))) { equity += trade.pnl ?? 0; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity) }
  return drawdown
}
export function buildEquityCurve(trades: Trade[]) {
  let equity = 0
  return [...trades].filter(t => t.status === 'Closed').sort((a, b) => a.date.localeCompare(b.date)).map(t => ({ date: t.date.slice(5), equity: Math.round((equity += t.pnl ?? 0) * 100) / 100, pnl: t.pnl ?? 0 }))
}
