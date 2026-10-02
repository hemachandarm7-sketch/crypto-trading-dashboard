import type { ExtractedTradeData, Trade } from '../types'

export function normalizeSymbol(value: string | null | undefined): string | null {
  if (!value) return null
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function sameExchange(trade: Trade, data: ExtractedTradeData) {
  return !data.exchange || !trade.exchange || data.exchange.toLowerCase() === trade.exchange.toLowerCase()
}
function timeDistance(a: string | null, b: string | null | undefined) {
  if (!a || !b) return null
  const distance = Math.abs(Date.parse(a) - Date.parse(b))
  return Number.isFinite(distance) ? distance : null
}
function valuesMatch(a: number | null | undefined, b: number | null | undefined, ratio = 0.02) {
  return a == null || b == null || Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * ratio)
}

/** Find a strong identity match only. Same-symbol trades are never merged by symbol alone. */
export function findOpenTradeForPositionDetails(trades: Trade[], data: ExtractedTradeData): Trade | null {
  const symbol = normalizeSymbol(data.symbol)
  if (!symbol) return null
  const candidates = trades.filter(trade => trade.status === 'OPEN'
    && normalizeSymbol(trade.symbol) === symbol
    && (!data.direction || trade.direction === data.direction)
    && sameExchange(trade, data)
    && (data.leverage == null || trade.leverage == null || data.leverage === trade.leverage)
    && valuesMatch(data.quantity, trade.quantity)
    && valuesMatch(data.avgEntry ?? data.transactionPrice, trade.avgEntry))
  if (data.positionId) {
    const exact = candidates.filter(trade => trade.exchangePositionId === data.positionId)
    return exact.length === 1 ? exact[0] : null
  }
  // Do not associate a details screenshot to a trade solely by coin/side.
  const hasPositionEvidence = (trade: Trade) =>
    (data.quantity != null && trade.quantity != null)
    || ((data.avgEntry ?? data.transactionPrice) != null && trade.avgEntry != null)
    || (data.leverage != null && trade.leverage != null)
  const corroborated = candidates.filter(hasPositionEvidence)
  return corroborated.length === 1 ? corroborated[0] : null
}

export function findDuplicateOpenTrade(trades: Trade[], data: ExtractedTradeData): Trade | null {
  const symbol = normalizeSymbol(data.symbol)
  if (!symbol || !data.direction) return null
  const candidates = trades.filter(trade => trade.status === 'OPEN'
    && trade.direction === data.direction
    && normalizeSymbol(trade.symbol) === symbol
    && sameExchange(trade, data))
  if (data.positionId) {
    const exact = candidates.filter(trade => trade.exchangePositionId === data.positionId)
    return exact.length === 1 ? exact[0] : null
  }
  if (!data.eventTime) return null
  const exactTime = candidates.filter(trade => {
    const distance = timeDistance(trade.openTime, data.eventTime)
    return distance != null && distance <= 120_000
  })
  return exactTime.length === 1 ? exactTime[0] : null
}

/** Use a single active position for this market/side to link transaction fills or snapshots. */
export function findUniqueOpenTrade(trades: Trade[], data: ExtractedTradeData): Trade | null {
  const symbol = normalizeSymbol(data.symbol)
  if (!symbol) return null
  let candidates = trades.filter(trade => trade.status === 'OPEN'
    && normalizeSymbol(trade.symbol) === symbol
    && (!data.direction || trade.direction === data.direction)
    && sameExchange(trade, data))
  if (data.positionId) {
    const exact = candidates.filter(trade => trade.exchangePositionId === data.positionId)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) return null
  }
  if (data.eventTime) {
    const eventMs = Date.parse(data.eventTime)
    if (Number.isFinite(eventMs)) candidates = candidates.filter(trade => !trade.openTime || Date.parse(trade.openTime) <= eventMs)
  }
  return candidates.length === 1 ? candidates[0] : null
}

/** A transaction screenshot may be uploaded after a position and close screenshot; attach its time to that lifecycle. */
export function findTradeForOpenTransaction(trades: Trade[], data: ExtractedTradeData): Trade | null {
  const symbol = normalizeSymbol(data.symbol)
  if (!symbol || !data.eventTime) return null
  const eventMs = Date.parse(data.eventTime)
  if (!Number.isFinite(eventMs)) return null
  const candidates = trades.filter(trade => {
    if (normalizeSymbol(trade.symbol) !== symbol || !sameExchange(trade, data)) return false
    if (data.direction && trade.direction !== data.direction) return false
    if (data.transactionId && trade.openTransactionId === data.transactionId) return true
    if (trade.openTime) return Math.abs(Date.parse(trade.openTime) - eventMs) <= 5 * 60_000
    if (trade.status === 'OPEN') return true
    return Boolean(trade.closeTime && Date.parse(trade.closeTime) >= eventMs)
  })
  return candidates.length === 1 ? candidates[0] : null
}

/** Close events may omit side; a unique symbol match is safe, ambiguous ties stay unmatched. */
export function findOpenTradeForClose(trades: Trade[], data: ExtractedTradeData): Trade | null {
  const symbol = normalizeSymbol(data.symbol)
  if (!symbol) return null
  let candidates = trades.filter(trade => trade.status === 'OPEN'
    && (!data.direction || trade.direction === data.direction)
    && normalizeSymbol(trade.symbol) === symbol
    && sameExchange(trade, data))
  if (data.positionId) {
    const exact = candidates.filter(trade => trade.exchangePositionId === data.positionId)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) return null
  }
  if (data.eventTime) {
    const closeMs = Date.parse(data.eventTime)
    if (Number.isFinite(closeMs)) candidates = candidates.filter(trade => !trade.openTime || Date.parse(trade.openTime) <= closeMs)
  }
  if (candidates.length === 1) return candidates[0]
  if (!data.eventTime) return null

  const ranked = candidates.map(trade => {
    let score = data.direction ? 7 : 3 // direction is preferred; time can disambiguate screenshots without side text
    if (data.exchange && trade.exchange) score += 2
    if (data.quantity != null && trade.quantity != null && Math.abs(data.quantity - trade.quantity) <= Math.max(1e-9, Math.abs(trade.quantity) * 0.02)) score += 1
    const distance = timeDistance(trade.openTime, data.eventTime)
    if (distance != null) score += 2
    return { trade, score, distance: distance ?? Number.POSITIVE_INFINITY }
  }).sort((a, b) => b.score - a.score || a.distance - b.distance)
  if (!ranked.length) return null
  if (ranked.length > 1 && ranked[0].score === ranked[1].score && ranked[0].distance === ranked[1].distance) return null
  return ranked[0].score >= (data.direction ? 7 : 5) ? ranked[0].trade : null
}

export function findTradeForPnl(trades: Trade[], data: ExtractedTradeData): Trade | null {
  const symbol = normalizeSymbol(data.symbol)
  if (!symbol) return null
  let candidates = trades.filter(trade => normalizeSymbol(trade.symbol) === symbol
    && (!data.direction || trade.direction === data.direction)
    && sameExchange(trade, data)
    && (data.leverage == null || trade.leverage == null || data.leverage === trade.leverage)
    && valuesMatch(data.avgEntry ?? data.transactionPrice, trade.avgEntry))
  if (data.positionId) {
    const exact = candidates.filter(trade => trade.exchangePositionId === data.positionId)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) return null
  }
  if (data.eventTime) {
    candidates = candidates.filter(trade => {
      const distanceToOpen = timeDistance(trade.openTime, data.eventTime)
      const distanceToClose = timeDistance(trade.closeTime, data.eventTime)
      return (distanceToOpen != null && distanceToOpen <= 10 * 60_000)
        || (distanceToClose != null && distanceToClose <= 10 * 60_000)
    }).sort((a, b) => Math.min(timeDistance(a.openTime, data.eventTime) ?? Infinity, timeDistance(a.closeTime, data.eventTime) ?? Infinity)
      - Math.min(timeDistance(b.openTime, data.eventTime) ?? Infinity, timeDistance(b.closeTime, data.eventTime) ?? Infinity))
  } else {
    // Without IDs or a timestamp, require matching entry price as well as a
    // unique active trade. Symbol/side/leverage alone can describe repetitions.
    candidates = candidates.filter(trade => trade.status === 'OPEN')
  }
  const hasStrongEvidence = (trade: Trade) => Boolean(data.positionId || data.transactionId)
    || (data.eventTime != null && ((timeDistance(trade.openTime, data.eventTime) ?? Infinity) <= 10 * 60_000
      || (timeDistance(trade.closeTime, data.eventTime) ?? Infinity) <= 10 * 60_000))
    || ((data.avgEntry ?? data.transactionPrice) != null && trade.avgEntry != null && data.leverage != null && data.leverage === trade.leverage)
  const corroborated = candidates.filter(hasStrongEvidence)
  return corroborated.length === 1 ? corroborated[0] : null
}
