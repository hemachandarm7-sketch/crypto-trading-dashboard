import type { Direction, ExtractedTradeData, ScreenshotType } from '../types'
import { parsePnlPercentage } from './tradeLifecycle'
import { detectCurrency, type CurrencyCode, type MonetaryField } from '../utils/currency'

function labeledNumber(text: string, label: string): number | undefined {
  const pattern = new RegExp('(?:^|\\n|\\b)' + label + '[ \\t]*(?:\\([^\\n)]*\\)[ \\t]*)?[:=#]?[ \\t]*[₹$]?[ \\t]*([+-]?[\\d,]+(?:\\.\\d+)?)', 'i')
  const value = text.match(pattern)?.[1]
  if (value) {
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return labeledGridNumber(text, label)
}

function labeledAmount(text: string, label: string): number | undefined {
  const usdtValue = labeledUsdtAmount(text, label)
  if (usdtValue != null) return usdtValue
  const direct = new RegExp('(?:^|\\n|\\b)' + label + '[ \\t]*(?:\\([^\\n)]*\\)[ \\t]*)?[:=#]?[ \\t]*([+-]?[ \\t]*[₹$]?[ \\t]*[\\d,]+(?:\\.\\d+)?)', 'i').exec(text)?.[1]
  if (direct) {
    const value = Number(direct.replace(/[₹$\\s,]/g, ''))
    if (Number.isFinite(value)) return value
  }

  const lines = text.split(/\r?\n/)
  const nextMetric = amountSectionBoundary
  for (const [index, line] of lines.entries()) {
    if (!new RegExp(label, 'i').test(line) || index + 1 >= lines.length) continue
    for (let valueIndex = index + 1; valueIndex < lines.length && valueIndex <= index + 3; valueIndex++) {
      const candidate = lines[valueIndex].trim()
      if (!candidate) continue
      if (nextMetric.test(candidate)) break
      const value = candidate.match(/^([+-]?\s*[₹$]?\s*\d[\d,]*(?:\.\d+)?)(?:\s*(?:INR|USD|USDT))?\s*$/i)?.[1]
      if (value) {
        const parsed = Number(value.replace(/[₹$\s,]/g, ''))
        if (Number.isFinite(parsed)) return parsed
      }
      break
    }
  }
  return undefined
}

const amountSectionBoundary = /^\s*(?:Net\s+P(?:NL|&L)|Gross\s+P(?:NL|&L)|Fees?|Profit\s*%|Loss\s*%|ROI|ROE|Entry\s+Price|Close\s+Price|Created\s+At|(?:Qty|Quantity|Size|Margin|Avg\.?\s*Entry|Average\s*Entry|LTP|Last\s*Traded\s*Price|Li[qg]\.?\s*Price|Liquidation\s*Price|TP|Take\s*Profit|SL|Stop\s*Loss|Order\s+ID|Transaction\s+type|Open|Close)\b)/i

function labeledUsdtAmount(text: string, label: string): number | undefined {
  const lines = text.split(/\r?\n/)
  const nextMetric = amountSectionBoundary
  for (let index = 0; index < lines.length; index++) {
    if (!new RegExp(label, 'i').test(lines[index])) continue
    const parts = [lines[index]]
    for (let next = index + 1; next < lines.length && next <= index + 3; next++) {
      if (nextMetric.test(lines[next])) break
      parts.push(lines[next])
    }
    const match = parts.join(' ').match(/([+-]?\s*[₹$]?\s*\d[\d,]*(?:\.\d+)?)\s*USDT\b/i)
    if (match) {
      const value = Number(match[1].replace(/[₹$\s,]/g, ''))
      if (Number.isFinite(value)) return value
    }
  }
  return undefined
}

function labeledInrAmount(text: string, label: string): number | undefined {
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    if (!new RegExp(label, 'i').test(lines[index])) continue
    const parts = [lines[index]]
    for (let next = index + 1; next < lines.length && next <= index + 3; next++) {
      if (amountSectionBoundary.test(lines[next])) break
      parts.push(lines[next])
    }
    const match = parts.join(' ').match(/([+-]?)\s*(?:₹|\bINR\b|\bRs\.?)\s*([+-]?\s*\d[\d,]*(?:\.\d+)?)/i)
    if (!match) continue
    const value = Number(match[2].replace(/[\s,]/g, ''))
    if (Number.isFinite(value)) return match[1] === '-' || match[2].trim().startsWith('-') ? -Math.abs(value) : Math.abs(value)
  }
  return undefined
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
    /(?:Qty|Quantity)\b/i, /\bSize\b/i, /\bMargin(?:\s+Used)?\b/i,
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
    const labelsOnLine = (candidate: string) => fieldPatterns
      .map((pattern, fieldIndex) => ({ fieldIndex, index: pattern.exec(candidate)?.index ?? -1 }))
      .filter(field => field.index >= 0)
      .sort((a, b) => a.index - b.index)

    // OCR may emit a compact header, one label per line, or one value per line.
    // Treat adjacent label lines as one column header and collect only the
    // contiguous numeric block that follows it. A later labeled section (such
    // as Avg Entry / LTP / Liq. Price) is a hard boundary.
    let groupStart = lineIndex
    while (groupStart > 0) {
      let previous = groupStart - 1
      while (previous >= 0 && !lines[previous].trim()) previous--
      if (previous < 0 || labelsOnLine(lines[previous]).length === 0) break
      groupStart = previous
    }

    let groupEnd = lineIndex
    while (groupEnd + 1 < lines.length) {
      let next = groupEnd + 1
      while (next < lines.length && !lines[next].trim()) next++
      if (next >= lines.length || labelsOnLine(lines[next]).length === 0) break
      groupEnd = next
    }

    const headerFields: Array<{ fieldIndex: number; lineIndex: number; index: number }> = []
    for (let headerLine = groupStart; headerLine <= groupEnd; headerLine++) {
      headerFields.push(...labelsOnLine(lines[headerLine]).map(field => ({ ...field, lineIndex: headerLine })))
    }
    const targetField = headerFields.findIndex(field => field.lineIndex === lineIndex && field.index === target.index)
    if (targetField < 0) continue

    const values: string[] = []
    for (let valueLineIndex = groupEnd + 1; valueLineIndex < lines.length; valueLineIndex++) {
      const valueLine = lines[valueLineIndex].trim()
      if (!valueLine) continue
      if (labelsOnLine(valueLine).length > 0) break
      const rowValues = valueLine.match(/[+-]?\d[\d,]*(?:\.\d+)?/g)
      if (!rowValues?.length) break
      values.push(...rowValues)
      if (values.length >= headerFields.length) break
    }

    const value = values[targetField]
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
  const transactionDetails = text.match(/Transaction\s+Details[\s\S]{0,300}/i)?.[0]
  const transactionAction = transactionDetails?.match(/\b(Open|Close)\b/i)?.[1]
  if (transactionAction) return transactionAction.toLowerCase() === 'open' ? 'OPEN_TRANSACTION' : 'CLOSE_TRANSACTION'
  if (/\b(?:Profit\s*%|Loss\s*%|ROI|ROE|P\s*&\s*L|(?:Net|Gross)\s+P(?:NL|&L)|Fees?|Realized\s+Pnl)\b/i.test(text)) return 'PNL'
  if (/\b(?:Qty|Quantity)\b|\bSize\s*\(|\bMargin\s*\(|\bLeverage\b|\bAvg\.?\s*Entry\b|\bLiq\.?\s*Price\b|\bLiquidation\s*Price\b/i.test(text)) return 'POSITION_DETAILS'
  if (/\b(?:LONG|SHORT)\s+\d+(?:\.\d+)?\s*x\b/i.test(text.replace(/\s+/g, ' '))) return 'POSITION_DETAILS'
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
  // Normalize common Indian currency spelling so the labelled-number parser
  // can read it without losing the explicit INR signal.
  text = text.replace(/\bRs\.?[ \t]*(?=\d)/gi, '₹')
  const screenshotType = classify(text)
  const symbol = text.match(/\b(?:Symbol|Pair|Contract)\s*[:=#]?\s*([A-Z0-9]{2,}(?:\s*[/_-]\s*[A-Z0-9]{2,})?)/i)?.[1]
    ?? text.match(/\b([A-Z0-9]{2,}\s*\/\s*(?:USDT|USDC|USD|BTC|ETH))\b/i)?.[1]
  const normalizedSymbol = extractSymbol(text) ?? symbol?.replace(/\s/g, '').replace(/_/g, '/').replace(/-/g, '/').toUpperCase()
  const side = text.match(/\b(?:Direction|Side|Position)\s*[:=#]?\s*(LONG|SHORT)\b/i)?.[1]
    ?? text.match(/\b(LONG|SHORT)\s+\d+(?:\.\d+)?\s*x\b/i)?.[1]
    ?? text.match(/\b(LONG|SHORT)\b/i)?.[1]
  const direction: Direction | undefined = side?.toUpperCase() as Direction | undefined
  const leverage = extractLeverage(text)
  const fieldText = text.replace(/\b(Qty|Quantity|Size|Margin(?:\s+Used)?)\s*\([^)]*\)/gi, '$1')
  const quantity = labeledNumber(fieldText, '(?:Qty|Quantity)')
  const size = labeledNumber(fieldText, 'Size')
  const margin = labeledNumber(fieldText, 'Margin(?:\\s+Used)?')
  const avgEntry = labeledNumber(text, 'Avg\\.?\\s*Entry') ?? labeledNumber(text, 'Average\\s*Entry') ?? labeledNumber(text, 'Entry\\s*Price')
  const ltp = labeledNumber(text, '(?:LTP|Last\\s*Traded\\s*Price)')
  const liquidationPrice = labeledNumber(text, '(?:Li[qg]\\.?\\s*Price|Liquidation\\s*Price)')
  const takeProfit = labeledNumber(text, '(?:TP|Take\\s*Profit)')
  const stopLoss = labeledNumber(text, '(?:SL|Stop\\s*Loss)')
  const closePrice = labeledNumber(text, '(?:Close\\s*Price|Exit\\s*Price)')
  const transactionPrice = labeledNumber(text, '(?:Transaction\\s*Price|Price)')
  const grossPnlAmount = labeledAmount(text, 'Gross\\s+P(?:NL|&L)')
  const feeAmount = labeledAmount(text, 'Fees?')
  const pnlAmount = screenshotType === 'CLOSE_TRANSACTION' || screenshotType === 'PNL' ? labeledAmount(text, 'Net\\s+P(?:NL|&L)') : undefined
  const pnlPercentage = parsePnlPercentage(text)
  const transactionId = text.match(/\b(?:Transaction|Order|Trade)\s*(?:ID|No\.?|#)\s*[:=#]?\s*([A-Z0-9_-]+)/i)?.[1]
  const positionId = text.match(/\b(?:Position\s*ID|Position\s*No\.?|Contract\s*ID)\s*[:=#]?\s*([A-Z0-9_-]+)/i)?.[1]
  const exchange = text.match(/\b(?:Exchange|Platform)\s*[:=#]?\s*([A-Z][A-Z0-9_-]+)/i)?.[1]
  const marketType = text.match(/\b(Spot|Perpetual|Futures)\b/i)?.[1]
  const marginMode = text.match(/\b(Isolated|Cross)\b/i)?.[1]?.toUpperCase() as 'ISOLATED' | 'CROSS' | undefined
  const fieldCurrencies: Partial<Record<MonetaryField, CurrencyCode>> = {}
  const fieldValues: Partial<Record<MonetaryField, number | undefined>> = {
    size, margin, transactionPrice, closePrice, avgEntry, ltp, liquidationPrice, takeProfit, stopLoss,
    pnlAmount, grossPnlAmount, feeAmount,
  }
  const currencyAudit: NonNullable<ExtractedTradeData['currencyAudit']> = {}
  const currencyCandidates: [MonetaryField, string][] = [
    ['size', '\\bSize\\b'], ['margin', '\\bMargin(?:\\s+Used)?\\b'], ['transactionPrice', '\\b(?:Transaction\\s+)?Price\\b'],
    ['closePrice', '\\b(?:Close|Exit)\\s+Price\\b'], ['avgEntry', '\\b(?:Avg\\.?\\s*Entry|Average\\s*Entry|Entry\\s*Price)\\b'],
    ['ltp', '\\b(?:LTP|Last\\s*Traded\\s*Price)\\b'], ['liquidationPrice', '\\b(?:Li[qg]\\.?\\s*Price|Liquidation\\s*Price)\\b'],
    ['takeProfit', '\\b(?:TP|Take\\s*Profit)\\b'], ['stopLoss', '\\b(?:SL|Stop\\s*Loss)\\b'],
    ['pnlAmount', '\\b(?:Net\\s+P(?:NL|&L)|P\\s*&\\s*L|Profit|Loss)\\b'],
    ['grossPnlAmount', '\\bGross\\s+P(?:NL|&L)\\b'], ['feeAmount', '\\bFees?\\b'],
  ]
  for (const [field, label] of currencyCandidates) {
    const match = new RegExp(label, 'i').exec(text)
    if (!match) continue
    const lineEndIndex = text.indexOf('\n', match.index)
    const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex
    const labelLine = text.slice(match.index, lineEnd)
    const nextLine = text.slice(lineEnd + 1).split(/\r?\n/).find(candidate => candidate.trim()) ?? ''
    const nextValueLine = /\b(?:Qty|Quantity|Size|Margin(?: Used)?|Avg\.?\s*Entry|Average\s*Entry|LTP|Last\s*Traded\s*Price|Li[qg]\.?\s*Price|Liquidation\s*Price|TP|Take\s*Profit|SL|Stop\s*Loss|Net\s+P(?:NL|&L))\b/i.test(nextLine) ? '' : nextLine
    // Keep currency detection close to this label/value pair. A broad text
    // window can accidentally borrow INR from an unrelated P&L line.
    const labelIsUsdtPnl = (field === 'pnlAmount' || field === 'grossPnlAmount' || field === 'feeAmount') && labeledUsdtAmount(text, label) != null
    const currency = labelIsUsdtPnl ? 'USDT' : detectCurrency(labelLine)
      ?? detectCurrency(nextValueLine)
      ?? (normalizedSymbol?.toUpperCase().includes('/USDT') ? 'USDT' : null)
    if (currency) fieldCurrencies[field] = currency
    const value = fieldValues[field]
    const alternateInr = currency === 'USDT' ? labeledInrAmount(text, label) : undefined
    if (value != null && alternateInr != null) {
      currencyAudit[field] = {
        originalValue: value, originalCurrency: 'USDT', usdRate: 1, rateDate: null,
        rateSource: null, convertedAt: null, alternateValues: [{ value: alternateInr, currency: 'INR' }],
      }
    }
  }
  if (screenshotType === 'CLOSE_TRANSACTION' || screenshotType === 'PNL') {
    if (pnlAmount != null && labeledUsdtAmount(text, 'Net\\s+P(?:NL|&L)') != null) fieldCurrencies.pnlAmount = 'USDT'
    else if (pnlAmount != null && !fieldCurrencies.pnlAmount) fieldCurrencies.pnlAmount = detectCurrency(text) ?? undefined
  }
  const fieldProvenance = Object.fromEntries(Object.entries({
    symbol: normalizedSymbol, direction, eventTime: parseOcrEventTime(text), transactionPrice, closePrice,
    leverage, quantity, size, margin, avgEntry, ltp, liquidationPrice, takeProfit, stopLoss,
    pnlAmount, grossPnlAmount, feeAmount, pnlPercentage: pnlPercentage ?? undefined,
  }).filter(([, value]) => value != null).map(([field]) => [field, { source: 'direct_ocr' as const }]))
  return {
    screenshotType, symbol: normalizedSymbol, direction,
    eventTime: parseOcrEventTime(text), closePrice, transactionPrice, leverage, quantity, size, margin, avgEntry, ltp,
    liquidationPrice, takeProfit, stopLoss, pnlAmount, grossPnlAmount, feeAmount, pnlPercentage: pnlPercentage ?? undefined, transactionId, positionId, exchange,
    marketType: marketType?.toLowerCase() === 'spot' ? 'Spot' : marketType ? marketType[0].toUpperCase() + marketType.slice(1).toLowerCase() : undefined,
    marginMode, rawText: text, confidence, fieldCurrencies, fieldProvenance, currencyAudit,
  }
}
