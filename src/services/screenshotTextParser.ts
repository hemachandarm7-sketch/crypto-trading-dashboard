import type { Direction, ExtractedTradeData, ScreenshotType } from '../types'
import { parsePnlPercentage } from './tradeLifecycle'

function labeledNumber(text: string, label: string): number | undefined {
  const pattern = new RegExp('(?:^|\\n|\\b)' + label + '[ \\t]*(?:\\([^\\n)]*\\)[ \\t]*)?[:=#]?[ \\t]*[₹$]?[ \\t]*([+-]?[\\d,]+(?:\\.\\d+)?)', 'i')
  const value = text.match(pattern)?.[1]
  if (value) {
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return labeledGridNumber(text, label)
}

/** Accept only an explicit multiplier or an explicitly labelled leverage value. */
function extractLeverage(text: string): number | undefined {
  const normalized = text.normalize('NFKC').replace(/[×]/g, 'x').replace(/\s+/g, ' ').trim()
  const labelled = labeledNumber(normalized, 'Leverage')
  if (labelled != null && labelled > 0) return labelled

  const directionAdjacent = normalized.match(/\b(?:long|short)\b.{0,32}?\b(\d+(?:\.\d+)?)\s*x\b/i)
  const explicitMultiplier = directionAdjacent ?? normalized.match(/\b(\d+(?:\.\d+)?)\s*x\b/i)
  if (!explicitMultiplier) return undefined
  const value = Number(explicitMultiplier[1])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function labeledGridNumber(text: string, label: string): number | undefined {
  const fieldPatterns = [
    /(?:Qty|Quantity)\b/i, /\bSize\b/i, /\bMargin\b/i,
    /(?:Avg\.?\s*Entry|Average\s*Entry)\b/i,
    /(?:LTP|Last\s*Traded\s*Price)\b/i,
    /(?:Liq\.?|Lig\.?)\s*Price\b|Liquidation\s*Price\b/i,
    /\b(?:TP|Take\s*Profit)\b/i, /\b(?:SL|Stop\s*Loss)\b/i,
  ]
  const targetPattern = new RegExp(label, 'i')
  const lines = text.split(/\r?\n/)
  for (const [lineIndex, line] of lines.entries()) {
    const target = targetPattern.exec(line)
    if (!target) continue
    const positions = fieldPatterns
      .map((pattern, fieldIndex) => ({ fieldIndex, index: pattern.exec(line)?.index ?? -1 }))
      .filter(field => field.index >= 0)
      .sort((a, b) => a.index - b.index)
    const valueIndex = positions.findIndex(field => field.index === target.index)
    if (valueIndex < 0) continue
    const valueLine = lines.slice(lineIndex + 1).find(candidate =>
      (candidate.match(/[+-]?\d[\d,]*(?:\.\d+)?/g)?.length ?? 0) >= positions.length)
    const value = valueLine?.match(/[+-]?\d[\d,]*(?:\.\d+)?/g)?.[valueIndex]
    if (!value) continue
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}
function parseOcrEventTime(text: string): string | undefined {
  const source = text.match(/(?:Created\s+At|Date|Time)\s*[:#]?\s*([^\n]+)/i)?.[1] ?? text
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(source)) return isoEventTime(source)
  const match = source.match(/\b(\d{1,2})[/. -](\d{1,2})[/. -](20\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/i)
  if (!match) return undefined
  const [, dayText, monthText, yearText, hourText, minuteText, secondText = '0', meridiem = ''] = match
  const day = Number(dayText), month = Number(monthText), year = Number(yearText), minute = Number(minuteText), second = Number(secondText)
  let hour = Number(hourText)
  if (meridiem) hour = hour % 12 + (meridiem.toUpperCase() === 'PM' ? 12 : 0)
  const date = new Date(year, month - 1, day, hour, minute, second)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return date.toISOString()
}

function isoEventTime(text: string): string | undefined {
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?))?\b/)
  if (!match) return undefined
  const raw = match[2] ? `${match[1]}T${match[2]}` : `${match[1]}T00:00:00Z`
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) return undefined
  return new Date(parsed).toISOString()
}

function classify(text: string): ScreenshotType {
  const explicitTransaction = text.match(/Transaction\s+type\s*[:#]?\s*(Open|Close)\b/i)?.[1]
  if (explicitTransaction) return explicitTransaction.toLowerCase() === 'open' ? 'OPEN_TRANSACTION' : 'CLOSE_TRANSACTION'
  if (/\b(?:Profit\s*%|Loss\s*%|P\s*&\s*L|Net\s+P(?:NL|&L)|Realized\s+Pnl)\b/i.test(text)) return 'PNL'
  if (/\b(?:Qty|Quantity)\b|\bSize\s*\(|\bMargin\s*\(|\bLeverage\b|\bAvg\.?\s*Entry\b|\bLiq\.?\s*Price\b|\bLiquidation\s*Price\b/i.test(text)) return 'POSITION_DETAILS'
  const hasOpen = /\bopen\b/i.test(text)
  const hasClose = /\bclose\b/i.test(text)
  if (hasOpen && hasClose) return 'UNKNOWN'
  if (hasOpen) return 'OPEN_TRANSACTION'
  if (hasClose) return 'CLOSE_TRANSACTION'
  if (/(?:\bProfit\s*%|\bLoss\s*%|\bP\s*&\s*L\b|\bRealized\s+Pnl\b)/i.test(text)) return 'PNL'
  if (/\b(?:Leverage|Avg\.?\s*Entry|Li[qg]\.?\s*Price|Liquidation\s*Price|Margin)\b/i.test(text)) return 'POSITION_DETAILS'
  return 'UNKNOWN'
}

function extractSymbol(text: string): string | undefined {
  const pairPattern = /\b([A-Z0-9]{2,})\s*[^A-Z0-9\r\n]+\s*(USDT|USDC|USD|BTC|ETH)\b/i
  const marketLine = text.match(/\bMarket\b([^\n]*)/i)?.[1]
  const marketPair = marketLine?.match(pairPattern)
  if (marketPair) return marketPair[1] + '/' + marketPair[2].toUpperCase()
  const ignored = new Set(['HISTORY', 'FUTURES', 'TRANSACTION', 'DETAILS', 'ASSET'])
  for (const pair of text.matchAll(new RegExp(pairPattern.source, 'gi'))) {
    if (!ignored.has(pair[1].toUpperCase())) return pair[1] + '/' + pair[2].toUpperCase()
  }
  return undefined
}

export function normalizeExtractedText(text: string, confidence?: number): ExtractedTradeData {
  const screenshotType = classify(text)
  const symbol = text.match(/\b(?:Symbol|Pair|Contract)\s*[:=#]?\s*([A-Z0-9]{2,}(?:\s*[/_-]\s*[A-Z0-9]{2,})?)/i)?.[1]
    ?? text.match(/\b([A-Z0-9]{2,}\s*\/\s*(?:USDT|USDC|USD|BTC|ETH))\b/i)?.[1]
  const side = text.match(/\b(?:Direction|Side|Position)\s*[:=#]?\s*(LONG|SHORT)\b/i)?.[1]
    ?? text.match(/\b(LONG|SHORT)\s+\d+(?:\.\d+)?\s*x\b/i)?.[1]
    ?? text.match(/\b(LONG|SHORT)\b/i)?.[1]
  const direction: Direction | undefined = side?.toUpperCase() as Direction | undefined
  const leverage = extractLeverage(text)
  const fieldText = text.replace(/\b(Qty|Quantity|Size|Margin)\s*\([^)]*\)/gi, '$1')
  const quantity = labeledNumber(fieldText, '(?:Qty|Quantity)')
  const size = labeledNumber(fieldText, 'Size')
  const margin = labeledNumber(fieldText, 'Margin')
  const avgEntry = labeledNumber(text, 'Avg\\.?\\s*Entry') ?? labeledNumber(text, 'Average\\s*Entry') ?? labeledNumber(text, 'Entry\\s*Price')
  const ltp = labeledNumber(text, '(?:LTP|Last\\s*Traded\\s*Price)')
  const liquidationPrice = labeledNumber(text, '(?:Li[qg]\\.?\\s*Price|Liquidation\\s*Price)')
  const takeProfit = labeledNumber(text, '(?:TP|Take\\s*Profit)')
  const stopLoss = labeledNumber(text, '(?:SL|Stop\\s*Loss)')
  const closePrice = labeledNumber(text, '(?:Close\\s*Price|Exit\\s*Price)')
  const transactionPrice = labeledNumber(text, '(?:Transaction\\s*Price|Price)')
  const pnlAmount = screenshotType === 'CLOSE_TRANSACTION' || screenshotType === 'PNL' ? netUsdtPnl(text) : undefined
  const pnlPercentage = parsePnlPercentage(text)
  const transactionId = text.match(/\b(?:Transaction|Order|Trade)\s*(?:ID|No\.?|#)\s*[:=#]?\s*([A-Z0-9_-]+)/i)?.[1]
  const positionId = text.match(/\b(?:Position\s*ID|Position\s*No\.?|Contract\s*ID)\s*[:=#]?\s*([A-Z0-9_-]+)/i)?.[1]
  const exchange = text.match(/\b(?:Exchange|Platform)\s*[:=#]?\s*([A-Z][A-Z0-9_-]+)/i)?.[1]
  const marketType = text.match(/\b(Spot|Perpetual|Futures)\b/i)?.[1]
  return {
    screenshotType, symbol: extractSymbol(text) ?? symbol?.replace(/\s/g, '').replace(/_/g, '/').replace(/-/g, '/').toUpperCase(), direction,
    eventTime: parseOcrEventTime(text), closePrice, transactionPrice, leverage, quantity, size, margin, avgEntry, ltp,
    liquidationPrice, takeProfit, stopLoss, pnlAmount, pnlPercentage: pnlPercentage ?? undefined, transactionId, positionId, exchange,
    marketType: marketType?.toLowerCase() === 'spot' ? 'Spot' : marketType ? marketType[0].toUpperCase() + marketType.slice(1).toLowerCase() : undefined,
    rawText: text, confidence,
  }
}

function netUsdtPnl(text: string): number | undefined {
  const section = text.match(/Net\s+P(?:NL|&L)([\s\S]{0,100})/i)?.[1]
  const value = section?.match(/([+-]?\s*[₹$]?\s*\d[\d,]*(?:\.\d+)?)\s*USDT\b/i)?.[1]
  if (!value) return undefined
  const amount = Number(value.replace(/[₹$\s,]/g, ''))
  return Number.isFinite(amount) ? amount : undefined
}
