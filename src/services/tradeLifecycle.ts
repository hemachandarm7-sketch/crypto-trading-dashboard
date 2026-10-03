import type { CloseReason, Direction, Trade } from '../types'

const epsilon = 1e-10

function withinPriceTolerance(actual: number, target: number): boolean {
  const tolerance = Math.max(Math.abs(target) * 1e-6, epsilon)
  return Math.abs(actual - target) <= tolerance
}

/** Uses exact rounded-level matches first, then directional threshold rules. */
export function determineCloseReason(
  direction: Direction,
  closePrice: number | null | undefined,
  takeProfit: number | null | undefined,
  stopLoss: number | null | undefined,
): CloseReason {
  if (closePrice == null || !Number.isFinite(closePrice)) return 'UNKNOWN'
  const exactTp = takeProfit != null && withinPriceTolerance(closePrice, takeProfit)
  const exactSl = stopLoss != null && withinPriceTolerance(closePrice, stopLoss)
  if (exactTp && exactSl) return 'UNKNOWN'
  if (exactTp) return 'TP_HIT'
  if (exactSl) return 'SL_HIT'

  const reachedTp = takeProfit != null && (direction === 'LONG' ? closePrice >= takeProfit : closePrice <= takeProfit)
  const reachedSl = stopLoss != null && (direction === 'LONG' ? closePrice <= stopLoss : closePrice >= stopLoss)
  if (reachedTp && reachedSl) return 'UNKNOWN'
  if (reachedTp) return 'TP_HIT'
  if (reachedSl) return 'SL_HIT'
  return 'MANUAL_CLOSE'
}

export function getHoldingDurationSeconds(openTime: string | null, closeTime: string | null, now = Date.now()): number | null {
  if (!openTime) return null
  const openMs = Date.parse(openTime)
  const endMs = closeTime ? Date.parse(closeTime) : now
  if (!Number.isFinite(openMs) || !Number.isFinite(endMs)) return null
  return Math.max(0, Math.floor((endMs - openMs) / 1000))
}

export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '—'
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${remainder}s`].filter(Boolean).join(' ')
}

export function getTradeHoldingSeconds(trade: Trade, now = Date.now()): number | null {
  return trade.holdingDurationSeconds ?? getHoldingDurationSeconds(trade.openTime, trade.closeTime, now)
}

/** Conservative fallback: derivative contract multipliers are exchange-specific. */
export function calculateSpotPnl(direction: Direction, entry: number | null, close: number | null, quantity: number | null, marketType: string | null): number | null {
  if (marketType?.toLowerCase() !== 'spot' || entry == null || close == null || quantity == null) return null
  if (![entry, close, quantity].every(Number.isFinite)) return null
  return (close - entry) * quantity * (direction === 'LONG' ? 1 : -1)
}

export function resolvePnlPercentage(
  dedicatedPnl: number | null | undefined,
  closeTransactionPnl: number | null | undefined,
  existing: number | null,
  pnlAmount: number | null,
  margin: number | null,
): number | null {
  if (dedicatedPnl != null) return dedicatedPnl
  if (closeTransactionPnl != null) return closeTransactionPnl
  if (existing != null) return existing
  if (pnlAmount != null && margin != null && margin > 0) return pnlAmount / margin * 100
  return null
}

export type LabeledPnlType = 'PROFIT' | 'LOSS'

/** Repair common OCR glyph/spacing errors only for semantic label matching. */
export function normalizeProfitLossLabels(text: string): string {
  return text.normalize('NFKC')
    .replace(/\bp\s*r\s*[o0]\s*f\s*[i1l]\s*t\b/gi, 'Profit')
    .replace(/\bl\s*[o0]\s*s\s*s\b/gi, 'Loss')
}

export function detectLabeledPnlType(text: string): LabeledPnlType | null {
  const normalized = normalizeProfitLossLabels(text)
  const hasProfit = /\bprofit\s*[.:=_-]*\s*%/i.test(normalized)
  const hasLoss = /\bloss\s*[.:=_-]*\s*%/i.test(normalized)
  if (hasProfit === hasLoss) return null
  return hasProfit ? 'PROFIT' : 'LOSS'
}

export function parsePnlPercentage(text: string): number | null {
  const normalized = normalizeProfitLossLabels(text)
  const profit = normalized.match(/\bprofit\s*[.:=_-]*\s*%\s*[:=]?\s*([+-]?\s*\d+(?:\.\d+)?)\s*%?/i)
  const loss = normalized.match(/\bloss\s*[.:=_-]*\s*%\s*[:=]?\s*([+-]?\s*\d+(?:\.\d+)?)\s*%?/i)
  if (profit && loss) return null
  if (profit) return Math.abs(Number(profit[1].replace(/\s/g, '')))
  if (loss) return -Math.abs(Number(loss[1].replace(/\s/g, '')))
  const roi = text.match(/\b(?:ROI|ROE)\s*[:=#]?\s*([+-]?\s*\d+(?:\.\d+)?)\s*%?/i)
  if (roi) return Number(roi[1].replace(/\s/g, ''))
  return null
}
