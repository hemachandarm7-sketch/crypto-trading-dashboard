import type { ExtractedTradeData, Screenshot, ScreenshotType } from '../types'
import { createWorker } from 'tesseract.js'
import tesseractWorkerUrl from 'tesseract.js/dist/worker.min.js?url'
import { normalizeExtractedText } from './screenshotTextParser'
import {
  updateScreenshot,
  insertTrade,
  mapTrade,
  updateTradeFromExtraction,
  recordTradeEvent,
  requireTradeEventId,
  listTradeEvents,
} from './tradeRepository'
import { findDuplicateOpenTrade, findOpenTradeForClose, findOpenTradeForPositionDetails, findTradeForPnl, findTradeForOpenTransaction, normalizeSymbol } from './tradeMatchingService'
import { calculateSpotPnl, determineCloseReason, formatDuration, resolvePnlPercentage } from './tradeLifecycle'
import { ensureSupabaseUser, requireSupabase } from './supabaseClient'
import type { Json } from '../types/database.types'
import type { Trade, TradeEventType } from '../types'
import { getInrToUsdRate } from './exchangeRateService'
import { monetaryFields, type CurrencyCode } from '../utils/currency'
import { mergeTradeEvidence, reconstructTradeEvidence } from './tradeReconstruction'

export interface OCRResult { text: string; confidence?: number; recoveredMargin?: number }
export interface OCRProvider { extractText(file: File): Promise<OCRResult> }
export type OCRProviderFactory = () => OCRProvider | null

interface OCRBox { x0: number; y0: number; x1: number; y1: number }
interface OCRWord { text: string; bbox: OCRBox }
interface OCRLine { text: string; bbox: OCRBox; words: OCRWord[] }
interface OCRBlock { paragraphs: Array<{ lines: OCRLine[] }> }
export interface MarginValueCrop { left: number; top: number; width: number; height: number }

/** Locate the value row immediately below a recognized Margin label. */
export function findMarginValueCrop(blocks: OCRBlock[], imageWidth: number, imageHeight: number): MarginValueCrop | null {
  const nextSection = /\b(?:Qty|Quantity|Size|Margin|Avg\.?\s*Entry|Average\s*Entry|LTP|Last\s*Traded\s*Price|Li[qg]\.?(?:\s*Price)?|Liquidation\s*Price|TP|Take\s*Profit|SL|Stop\s*Loss)\b/i
  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      for (const [index, line] of paragraph.lines.entries()) {
        const marginWord = line.words.find(word => /^margin$/i.test(word.text))
        if (!marginWord || index + 1 >= paragraph.lines.length) continue
        const valueLine = paragraph.lines[index + 1]
        if (nextSection.test(valueLine.text) || valueLine.bbox.y0 < line.bbox.y1) continue
        const rowHeight = Math.max(1, valueLine.bbox.y1 - valueLine.bbox.y0)
        const padX = Math.max(18, Math.round((marginWord.bbox.x1 - marginWord.bbox.x0) * 0.2))
        const padY = Math.max(6, Math.round(rowHeight * 0.25))
        const left = Math.max(0, Math.floor(marginWord.bbox.x0 - padX))
        const right = Math.min(imageWidth, Math.ceil(Math.max(valueLine.bbox.x1, marginWord.bbox.x1 + padX)))
        const top = Math.max(0, Math.floor(valueLine.bbox.y0 - padY))
        const bottom = Math.min(imageHeight, Math.ceil(valueLine.bbox.y1 + padY))
        if (right <= left || bottom <= top) return null
        return { left, top, width: right - left, height: bottom - top }
      }
    }
  }
  return null
}

let workerPromise: ReturnType<typeof createWorker> | null = null
const trace = (...values: unknown[]) => { if (import.meta.env.DEV) console.debug(...values) }

async function retryMarginInLabeledCell(file: File, blocks: OCRBlock[]): Promise<number | undefined> {
  const bitmap = await createImageBitmap(file)
  try {
    const crop = findMarginValueCrop(blocks, bitmap.width, bitmap.height)
    if (!crop) return undefined
    const scale = 4
    const canvas = document.createElement('canvas')
    canvas.width = crop.width * scale
    canvas.height = crop.height * scale
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, crop.left, crop.top, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
    const worker = await workerPromise
    if (!worker) return undefined
    const retry = await worker.recognize(canvas)
    const rawValue = retry.data.text.match(/[+-]?\d[\d,]*(?:\.\d+)?/)?.[0]
    const parsed = rawValue ? Number(rawValue.replace(/,/g, '')) : NaN
    return Number.isFinite(parsed) ? parsed : undefined
  } finally {
    bitmap.close()
  }
}

/** Tesseract performs OCR in the browser; it requires no cloud API key. */
export const tesseractOCRProvider: OCRProvider = {
  async extractText(file) {
    trace('[OCR] image received', { name: file.name, type: file.type, size: file.size })
    workerPromise ??= createWorker('eng', 1, {
      workerPath: tesseractWorkerUrl,
      workerBlobURL: false,
      logger: message => trace('[OCR] progress', message),
    })
    try {
      const worker = await workerPromise
      trace('[OCR] provider called')
      const result = await worker.recognize(file, {}, { text: true, blocks: true })
      trace('[OCR] raw text length', result.data.text.length)
      trace('[OCR] raw text', result.data.text)
      const parsed = normalizeExtractedText(result.data.text, result.data.confidence / 100)
      if (parsed.screenshotType === 'POSITION_DETAILS' && parsed.margin == null && result.data.blocks) {
        try {
          const margin = await retryMarginInLabeledCell(file, result.data.blocks)
          if (margin != null) {
            parsed.margin = margin
            parsed.fieldProvenance = { ...(parsed.fieldProvenance ?? {}), margin: { source: 'direct_ocr' } }
            trace('[OCR] recovered Margin from label-guided crop', margin)
          }
        } catch (error) {
          trace('[OCR] label-guided Margin retry failed', error)
        }
      }
      return { text: result.data.text, confidence: result.data.confidence / 100, ...(parsed.margin != null ? { recoveredMargin: parsed.margin } : {}) }
    } catch (error) {
      workerPromise = null
      throw error
    }
  },
}

export const getOCRProvider: OCRProviderFactory = () => tesseractOCRProvider

export async function extractScreenshot(file: File, provider: OCRProvider | null = getOCRProvider()): Promise<ExtractedTradeData> {
  trace('[OCR] started')
  if (!provider) throw new Error('OCR is not configured. The image was safely uploaded; enter the extracted fields manually or configure an OCRProvider.')
  const result = await provider.extractText(file)
  if (!result.text.trim()) throw new Error('The OCR provider returned no readable text. Review this screenshot and enter the fields manually.')
  trace('[EXTRACT] started')
  const normalized = normalizeExtractedText(result.text, result.confidence)
  if (result.recoveredMargin != null) {
    normalized.margin = result.recoveredMargin
    normalized.fieldProvenance = { ...(normalized.fieldProvenance ?? {}), margin: { source: 'direct_ocr' } }
  }
  const reconstructed = reconstructTradeEvidence(normalized)
  trace('[EXTRACT] screenshot type', normalized.screenshotType)
  trace('[EXTRACT] normalized result', reconstructed)
  return reconstructed
}

export async function processScreenshot(
  screenshot: Screenshot,
  file: File,
  provider: OCRProvider | null = getOCRProvider(),
  onStatusChange?: () => void | Promise<void>,
): Promise<ExtractedTradeData> {
  trace('[UPLOAD] file name/type/size', file.name, file.type, file.size)
  try {
    await updateScreenshot(screenshot.id, { extraction_status: 'PROCESSING', extraction_raw_data: null })
    await onStatusChange?.()
    const data = await extractScreenshot(file, provider)
    await updateScreenshot(screenshot.id, {
      screenshot_type: data.screenshotType,
      extracted_at: new Date().toISOString(),
      extraction_status: 'EXTRACTED',
      extraction_raw_data: toJsonObject(data) as unknown as Json,
      extraction_confidence: data.confidence ?? null,
    })
    trace('[MATCH] waiting for user confirmation; extraction has not been written to trades yet')
    await onStatusChange?.()
    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Screenshot processing failed.'
    await updateScreenshot(screenshot.id, {
      extraction_status: 'FAILED', extracted_at: new Date().toISOString(),
      extraction_raw_data: { error: message, providerConfigured: provider != null },
    })
    await onStatusChange?.()
    throw new Error(message)
  }
}

export async function confirmManualExtraction(screenshot: Screenshot, data: ExtractedTradeData, selectedTradeId?: string, forceCreateNew = false): Promise<string | null> {
  trace('[FORM CONFIRMED]', { screenshotId: screenshot.id, screenshotType: data.screenshotType, symbol: data.symbol, direction: data.direction, leverage: data.leverage })
  data = reconstructTradeEvidence(data)
  data = await normalizeScreenshotCurrencies(data)
  await updateScreenshot(screenshot.id, {
    screenshot_type: data.screenshotType, extracted_at: new Date().toISOString(), extraction_status: 'EXTRACTED',
    extraction_raw_data: toJsonObject(data) as unknown as Json, extraction_confidence: data.confidence ?? null,
  })
  const tradeId = await applyExtraction(screenshot.id, data, selectedTradeId, forceCreateNew)
  trace('[MATCH] result', tradeId ? { tradeId } : 'unmatched')
  return tradeId
}

/** Convert only explicitly identified fiat values. Rate failures never prevent saving the screenshot/trade. */
export async function normalizeScreenshotCurrencies(data: ExtractedTradeData): Promise<ExtractedTradeData> {
  const normalized: ExtractedTradeData = { ...data, fieldCurrencies: { ...data.fieldCurrencies }, currencyAudit: { ...data.currencyAudit } }
  const eventDate = data.eventTime ? new Date(data.eventTime) : new Date()
  const localDate = Number.isFinite(eventDate.getTime()) ? eventDate : new Date()
  const sourceDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`
  let inrRate: { rate: number; date: string } | null = null
  for (const field of monetaryFields) {
    const value = data[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (data.currencyAudit?.[field]) continue
    const currency: CurrencyCode | undefined = data.fieldCurrencies?.[field]
      ?? (data.symbol?.toUpperCase().includes('/USDT') ? 'USDT' : undefined)
    // Unmarked currencies remain auditable in OCR raw text, and are never guessed into INR.
    if (!currency) continue
    let usdRate: number | null = currency === 'INR' ? null : 1
    let rateDate: string | null = currency === 'INR' ? null : sourceDate
    if (currency === 'INR') {
      try {
        inrRate ??= await getInrToUsdRate(sourceDate)
        usdRate = inrRate.rate
        rateDate = inrRate.date
      } catch (error) {
        trace('[CURRENCY] INR to USD rate unavailable; preserving original in screenshot metadata', error)
      }
    }
    normalized.currencyAudit![field] = {
      originalValue: value,
      originalCurrency: currency,
      usdRate,
      rateDate,
      rateSource: currency === 'INR' ? 'Frankfurter API' : null,
      convertedAt: currency === 'INR' && usdRate != null ? new Date().toISOString() : null,
    }
    normalized[field] = usdRate == null ? null : value * usdRate
  }
  return normalized
}

function toJsonObject(data: ExtractedTradeData): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>
}

function toDraft(data: ExtractedTradeData, useEventAsOpenTime = data.screenshotType === 'OPEN_TRANSACTION') {
  const initialPrice = data.avgEntry ?? data.transactionPrice
  if (!data.symbol) throw new Error('Cannot create a trade until the screenshot identifies a symbol.')
  const isClose = data.screenshotType === 'CLOSE_TRANSACTION'
  return {
    symbol: data.symbol, exchange: data.exchange ?? null, marketType: data.marketType ?? null,
    direction: data.direction ?? null, leverage: data.leverage ?? null, quantity: data.quantity ?? null, size: data.size ?? null,
    margin: data.margin ?? null, avgEntry: initialPrice ?? null, ltp: data.ltp ?? null,
    liquidationPrice: data.liquidationPrice ?? null, takeProfit: data.takeProfit ?? null, stopLoss: data.stopLoss ?? null,
    // A P&L or position screenshot timestamp is not the moment the position opened.
    openTime: useEventAsOpenTime ? data.eventTime ?? null : null, closeTime: null, holdingDurationSeconds: null, holdingDurationDisplay: null,
    closePrice: isClose ? data.closePrice ?? data.transactionPrice ?? null : null,
    pnlAmount: data.pnlAmount ?? null, pnlPercentage: data.pnlPercentage ?? null,
    status: isClose ? 'CLOSED' as const : 'OPEN' as const, closeReason: null,
    ...(isClose ? { closeTime: data.eventTime ?? null } : {}),
    setup: null, notes: null, exchangePositionId: data.positionId ?? null,
    openTransactionId: data.screenshotType === 'OPEN_TRANSACTION' ? data.transactionId ?? null : null,
    closeTransactionId: isClose ? data.transactionId ?? null : null,
  }
}

async function listCurrentTrades(): Promise<Trade[]> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('trades').select('*').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map(mapTrade)
}

async function findPendingOpenScreenshot(userId: string, data: ExtractedTradeData) {
  const symbol = normalizeSymbol(data.symbol)
  if (!symbol) return null
  const client = requireSupabase()
  // Unmatched extraction belongs on screenshots until a trade exists. Production schemas
  // may require trade_events.trade_id NOT NULL, so pending opens must never be event rows.
  const { data: screenshots, error } = await client.from('screenshots')
    .select('id,uploaded_at,extraction_raw_data')
    .eq('user_id', userId).eq('screenshot_type', 'OPEN_TRANSACTION').is('trade_id', null)
    .not('extraction_raw_data', 'is', null).order('uploaded_at', { ascending: false }).limit(200)
  if (error) throw error
  const candidates = (screenshots ?? []).filter(screenshot => {
    const raw = screenshot.extraction_raw_data as Record<string, unknown>
    return normalizeSymbol(typeof raw.symbol === 'string' ? raw.symbol : undefined) === symbol
      && (!data.direction || !raw.direction || raw.direction === data.direction)
      && (!data.eventTime || typeof raw.eventTime !== 'string' || Date.parse(raw.eventTime) <= Date.parse(data.eventTime))
  })
  const entryPrice = data.avgEntry ?? data.transactionPrice
  const corroborated = candidates.filter(screenshot => {
    const raw = screenshot.extraction_raw_data as Record<string, unknown>
    const sameExternalId = Boolean(data.positionId && raw.positionId === data.positionId)
      || Boolean(data.transactionId && raw.transactionId === data.transactionId)
    const openEntry = typeof raw.avgEntry === 'number' ? raw.avgEntry : typeof raw.transactionPrice === 'number' ? raw.transactionPrice : null
    const sameEntry = entryPrice != null && openEntry != null && Math.abs(entryPrice - openEntry) <= Math.max(1e-9, Math.abs(entryPrice) * 0.02)
    const samePosition = Boolean(data.direction && raw.direction === data.direction
      && data.leverage != null && raw.leverage === data.leverage && sameEntry)
    return sameExternalId || samePosition
  })
  return corroborated.length === 1 ? corroborated[0] : null
}

async function detectDuplicateTransaction(userId: string, data: ExtractedTradeData): Promise<string | null> {
  if (!data.transactionId) return null
  const client = requireSupabase()
  const { data: trades, error: tradeError } = await client.from('trades').select('id,open_transaction_id,close_transaction_id').eq('user_id', userId)
  if (tradeError) throw tradeError
  const tradeMatch = trades?.find(trade => trade.open_transaction_id === data.transactionId || trade.close_transaction_id === data.transactionId)
  if (tradeMatch) return tradeMatch.id
  const { data: events, error } = await client.from('trade_events').select('trade_id,raw_data').eq('user_id', userId).not('trade_id', 'is', null)
  if (error) throw error
  const prior = events?.find((event: { trade_id: string | null; raw_data: Json }) => (event.raw_data as Record<string, unknown>)?.transactionId === data.transactionId)
  return prior?.trade_id ?? null
}

function nonNullPatch(data: ExtractedTradeData) {
  return {
    ...(data.direction != null ? { direction: data.direction } : {}),
    ...(data.exchange != null ? { exchange: data.exchange } : {}),
    ...(data.marketType != null ? { marketType: data.marketType } : {}),
    ...(data.leverage != null ? { leverage: data.leverage } : {}),
    ...(data.quantity != null ? { quantity: data.quantity } : {}),
    ...(data.size != null ? { size: data.size } : {}),
    ...(data.margin != null ? { margin: data.margin } : {}),
    ...(data.avgEntry != null ? { avgEntry: data.avgEntry } : data.transactionPrice != null ? { avgEntry: data.transactionPrice } : {}),
    ...(data.ltp != null ? { ltp: data.ltp } : {}),
    ...(data.liquidationPrice != null ? { liquidationPrice: data.liquidationPrice } : {}),
    ...(data.takeProfit != null ? { takeProfit: data.takeProfit } : {}),
    ...(data.stopLoss != null ? { stopLoss: data.stopLoss } : {}),
    ...(data.positionId != null ? { exchangePositionId: data.positionId } : {}),
  }
}

export async function applyExtraction(screenshotId: string, data: ExtractedTradeData, selectedTradeId?: string, forceCreateNew = false): Promise<string | null> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const trades = await listCurrentTrades()
  const screenshotRow = await client.from('screenshots').select('id,trade_id').eq('id', screenshotId).eq('user_id', userId).single()
  if (screenshotRow.error) throw screenshotRow.error

  const duplicateTradeId = await detectDuplicateTransaction(userId, data)
  if (duplicateTradeId) {
    await updateScreenshot(screenshotId, {
      trade_id: duplicateTradeId, extraction_status: 'MATCHED', screenshot_type: data.screenshotType,
      extraction_raw_data: toJsonObject(data) as unknown as Json, extraction_confidence: data.confidence ?? null,
    })
    await recordEvent(screenshotId, duplicateTradeId, data, data.screenshotType === 'CLOSE_TRANSACTION' ? 'CLOSE' : eventTypeFor(data.screenshotType))
    await updateScreenshot(screenshotId, { extraction_status: 'COMPLETED', extracted_at: new Date().toISOString() })
    return duplicateTradeId
  }

  let matched: Trade | null = forceCreateNew ? null : selectedTradeId
    ? trades.find(trade => trade.id === selectedTradeId) ?? null
    : trades.find(trade => trade.id === screenshotRow.data.trade_id)
      ?? trades.find(trade => trade.id === screenshotId)
      ?? null
  if (!forceCreateNew && matched && data.screenshotType !== 'PNL' && matched.status !== 'OPEN') matched = null
  const eventType: TradeEventType = eventTypeFor(data.screenshotType)
  if (data.screenshotType === 'UNKNOWN' || (!data.symbol && !matched)) {
    await updateScreenshot(screenshotId, {
      trade_id: null, extraction_status: 'EXTRACTED', screenshot_type: data.screenshotType,
      extraction_raw_data: toJsonObject(data) as unknown as Json, extraction_confidence: data.confidence ?? null,
    })
    return null
  }
  if (!forceCreateNew && !matched && data.screenshotType === 'OPEN_TRANSACTION') matched = findDuplicateOpenTrade(trades, data)
  if (!forceCreateNew && !matched && data.screenshotType === 'OPEN_TRANSACTION') matched = findTradeForOpenTransaction(trades, data)
  if (!forceCreateNew && !matched && data.screenshotType === 'CLOSE_TRANSACTION') matched = findOpenTradeForClose(trades, data)
  if (!forceCreateNew && !matched && data.screenshotType === 'POSITION_DETAILS') matched = findOpenTradeForPositionDetails(trades, data)
  if (!forceCreateNew && !matched && data.screenshotType === 'PNL') matched = findTradeForPnl(trades, data)

  const sameSideOpenTrades = data.symbol && data.direction ? trades.filter(trade => trade.status === 'OPEN'
    && normalizeSymbol(trade.symbol) === normalizeSymbol(data.symbol)
    && trade.direction === data.direction
    && (!data.exchange || !trade.exchange || trade.exchange.toLowerCase() === data.exchange.toLowerCase())) : []

  if (!forceCreateNew && !matched && sameSideOpenTrades.length === 0 && data.screenshotType === 'POSITION_DETAILS') {
    const pendingOpen = await findPendingOpenScreenshot(userId, data)
    const pendingData = pendingOpen?.extraction_raw_data as Partial<ExtractedTradeData> | undefined
    const combined: ExtractedTradeData = {
      ...(pendingData ?? {}),
      ...data,
      screenshotType: 'OPEN_TRANSACTION',
      eventTime: typeof pendingData?.eventTime === 'string' ? pendingData.eventTime : data.eventTime,
    }
    matched = await insertTrade(toDraft(reconstructTradeEvidence(combined), Boolean(pendingOpen)), screenshotId)
    if (pendingOpen) {
      // The parent is committed now. Associate the earlier screenshot and create its
      // OPEN event only after the definitive database ID is available.
      const parentTradeId = requireTradeEventId(matched.id)
      await recordEvent(pendingOpen.id, parentTradeId, {
        ...pendingData,
        screenshotType: 'OPEN_TRANSACTION',
      } as ExtractedTradeData, 'OPEN')
      await updateScreenshot(pendingOpen.id, { trade_id: parentTradeId, extraction_status: 'COMPLETED' })
    }
  }

  if (!matched) {
    // A valid typed screenshot is sufficient to create a partial trade. Missing
    // direction/position values remain NULL until later evidence is reviewed.
    matched = await insertTrade(toDraft(reconstructTradeEvidence(data), data.screenshotType === 'OPEN_TRANSACTION'), screenshotId)
  } else if (data.screenshotType === 'OPEN_TRANSACTION') {
    // An Open transaction may arrive before side/position details. Keep its facts and fill missing identity only.
    const resolvedOpenTime = matched.openTime ?? data.eventTime ?? null
    const resolvedHoldingSeconds = matched.status === 'CLOSED' && matched.closeTime && resolvedOpenTime
      ? Math.max(0, Math.floor((Date.parse(matched.closeTime) - Date.parse(resolvedOpenTime)) / 1000))
      : null
    const patch = {
      ...(matched.openTime == null && data.eventTime ? { openTime: data.eventTime } : {}),
      ...(matched.direction == null && data.direction ? { direction: data.direction } : {}),
      ...(matched.leverage == null && data.leverage != null ? { leverage: data.leverage } : {}),
      ...(matched.openTransactionId == null && data.transactionId ? { openTransactionId: data.transactionId } : {}),
      ...(matched.marketType == null && data.marketType ? { marketType: data.marketType } : {}),
      ...(matched.avgEntry == null && data.transactionPrice != null ? { avgEntry: data.transactionPrice } : {}),
      ...(matched.pnlAmount == null && data.pnlAmount != null ? { pnlAmount: data.pnlAmount } : {}),
      ...(matched.pnlPercentage == null && data.pnlPercentage != null ? { pnlPercentage: data.pnlPercentage } : {}),
      ...(resolvedHoldingSeconds != null ? {
        holdingDurationSeconds: resolvedHoldingSeconds,
        holdingDurationDisplay: formatDuration(resolvedHoldingSeconds),
      } : {}),
    }
    if (Object.keys(patch).length) matched = await updateTradeFromExtraction(matched.id, patch)
  } else if (matched && (data.screenshotType === 'POSITION_DETAILS' || data.screenshotType === 'PNL' || data.screenshotType === 'CLOSE_TRANSACTION')) {
    // Events are the durable evidence ledger. Combine the screenshots attached
    // to this exact trade ID before updating current trade fields.
    const priorEvents = await listTradeEvents(matched.id)
    const evidence = reconstructTradeEvidence(mergeTradeEvidence([
      ...priorEvents.map(event => event.rawData as Partial<ExtractedTradeData>),
      data,
    ]))

    if (data.screenshotType === 'POSITION_DETAILS') {
      matched = await updateTradeFromExtraction(matched.id, nonNullPatch(evidence))
    } else if (data.screenshotType === 'PNL') {
      const pnlPercentage = resolvePnlPercentage(evidence.pnlPercentage ?? null, null, matched.pnlPercentage, evidence.pnlAmount ?? matched.pnlAmount, evidence.margin ?? matched.margin)
      matched = await updateTradeFromExtraction(matched.id, {
        ...nonNullPatch(evidence),
        ...(evidence.pnlAmount != null ? { pnlAmount: evidence.pnlAmount } : {}),
        pnlPercentage,
      })
    } else {
      const closePrice = data.closePrice ?? data.transactionPrice ?? evidence.closePrice ?? null
      const closeTime = data.eventTime ?? null
      const closingDirection = evidence.direction ?? matched.direction
      const closeReason = closingDirection ? determineCloseReason(closingDirection, closePrice, evidence.takeProfit ?? matched.takeProfit, evidence.stopLoss ?? matched.stopLoss) : null
      const pnlAmount = evidence.pnlAmount ?? matched.pnlAmount ?? (closingDirection ? calculateSpotPnl(closingDirection, evidence.avgEntry ?? matched.avgEntry, closePrice, evidence.quantity ?? matched.quantity, matched.marketType) : null)
      const dedicatedPnl = await getDedicatedPnlPercentage(userId, matched.id)
      const pnlPercentage = resolvePnlPercentage(dedicatedPnl, evidence.pnlPercentage, matched.pnlPercentage, pnlAmount, evidence.margin ?? matched.margin)
      const holdingSeconds = matched.openTime && closeTime ? Math.max(0, Math.floor((Date.parse(closeTime) - Date.parse(matched.openTime)) / 1000)) : null
      matched = await updateTradeFromExtraction(matched.id, {
        ...nonNullPatch(evidence), status: 'CLOSED', closeTime, closePrice, closeReason,
        closeTransactionId: data.transactionId ?? matched.closeTransactionId,
        ...(pnlAmount != null ? { pnlAmount } : {}), pnlPercentage,
        holdingDurationSeconds: Number.isFinite(holdingSeconds) ? holdingSeconds : null,
        holdingDurationDisplay: formatDuration(holdingSeconds),
      })
    }
  }

  const tradeId = matched?.id ?? null
  const eventKind: TradeEventType = data.screenshotType === 'CLOSE_TRANSACTION' ? 'CLOSE' : eventType
  if (tradeId) await updateScreenshot(screenshotId, {
    trade_id: tradeId, extraction_status: 'MATCHED', screenshot_type: data.screenshotType,
    extracted_at: new Date().toISOString(), extraction_raw_data: toJsonObject(data) as unknown as Json,
    extraction_confidence: data.confidence ?? null,
  })
  if (tradeId) await recordEvent(screenshotId, tradeId, data, eventKind)
  await updateScreenshot(screenshotId, {
    trade_id: tradeId,
    extraction_status: tradeId ? 'COMPLETED' : 'EXTRACTED',
    screenshot_type: data.screenshotType,
    extracted_at: new Date().toISOString(),
    extraction_raw_data: toJsonObject(data) as unknown as Json,
    extraction_confidence: data.confidence ?? null,
  })
  return tradeId
}

async function getDedicatedPnlPercentage(userId: string, tradeId: string): Promise<number | null> {
  const client = requireSupabase()
  const { data, error } = await client.from('trade_events').select('percentage').eq('user_id', userId).eq('trade_id', tradeId).eq('event_type', 'PNL').not('percentage', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data?.percentage ?? null
}

function eventTypeFor(screenshotType: ScreenshotType): TradeEventType {
  if (screenshotType === 'OPEN_TRANSACTION') return 'OPEN'
  if (screenshotType === 'CLOSE_TRANSACTION') return 'CLOSE'
  if (screenshotType === 'PNL') return 'PNL'
  return 'POSITION_DETAILS'
}

async function recordEvent(screenshotId: string, tradeId: string, data: ExtractedTradeData, eventType: TradeEventType) {
  await recordTradeEvent({
    screenshotId, tradeId: requireTradeEventId(tradeId), eventType, eventTime: data.eventTime ?? undefined,
    price: data.closePrice ?? data.transactionPrice ?? data.avgEntry ?? undefined,
    percentage: data.pnlPercentage ?? undefined, rawData: toJsonObject(data),
  })
}
