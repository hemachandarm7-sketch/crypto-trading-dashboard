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
} from './tradeRepository'
import { findDuplicateOpenTrade, findOpenTradeForClose, findOpenTradeForPositionDetails, findTradeForPnl, findTradeForOpenTransaction, findUniqueOpenTrade, normalizeSymbol } from './tradeMatchingService'
import { calculateSpotPnl, determineCloseReason, formatDuration, resolvePnlPercentage } from './tradeLifecycle'
import { ensureSupabaseUser, requireSupabase } from './supabaseClient'
import type { Json } from '../types/database.types'
import type { Trade, TradeEventType } from '../types'

export interface OCRResult { text: string; confidence?: number }
export interface OCRProvider { extractText(file: File): Promise<OCRResult> }
export type OCRProviderFactory = () => OCRProvider | null

let workerPromise: ReturnType<typeof createWorker> | null = null
const trace = (...values: unknown[]) => { if (import.meta.env.DEV) console.debug(...values) }

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
      const result = await worker.recognize(file)
      trace('[OCR] raw text length', result.data.text.length)
      trace('[OCR] raw text', result.data.text)
      return { text: result.data.text, confidence: result.data.confidence / 100 }
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
  trace('[EXTRACT] screenshot type', normalized.screenshotType)
  trace('[EXTRACT] normalized result', normalized)
  return normalized
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
      extraction_raw_data: toJsonObject(data),
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

export async function confirmManualExtraction(screenshot: Screenshot, data: ExtractedTradeData, selectedTradeId?: string): Promise<void> {
  await updateScreenshot(screenshot.id, {
    screenshot_type: data.screenshotType, extracted_at: new Date().toISOString(), extraction_status: 'EXTRACTED',
    extraction_raw_data: toJsonObject(data), extraction_confidence: data.confidence ?? null,
  })
  const tradeId = await applyExtraction(screenshot.id, data, selectedTradeId)
  trace('[MATCH] result', tradeId ? { tradeId } : 'unmatched')
}

function toJsonObject(data: ExtractedTradeData): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value ?? null])) as Record<string, string | number | boolean | null>
}

function toDraft(data: ExtractedTradeData) {
  const initialPrice = data.avgEntry ?? data.transactionPrice
  if (!data.symbol || !data.direction) throw new Error('Cannot create a trade until both symbol and direction are confirmed from the screenshot.')
  return {
    symbol: data.symbol, exchange: data.exchange ?? null, marketType: data.marketType ?? null,
    direction: data.direction, leverage: data.leverage ?? null, quantity: data.quantity ?? null, size: data.size ?? null,
    margin: data.margin ?? null, avgEntry: initialPrice ?? null, ltp: data.ltp ?? null,
    liquidationPrice: data.liquidationPrice ?? null, takeProfit: data.takeProfit ?? null, stopLoss: data.stopLoss ?? null,
    openTime: data.eventTime ?? null, closeTime: null, holdingDurationSeconds: null, holdingDurationDisplay: null,
    closePrice: null, pnlAmount: null, pnlPercentage: null, status: 'OPEN' as const, closeReason: null,
    setup: null, notes: null, exchangePositionId: data.positionId ?? null,
    openTransactionId: data.transactionId ?? null, closeTransactionId: null,
  }
}

async function listCurrentTrades(): Promise<Trade[]> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('trades').select('*').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map(mapTrade)
}

async function findPendingOpenEvent(userId: string, data: ExtractedTradeData) {
  const symbol = normalizeSymbol(data.symbol)
  if (!symbol) return null
  const client = requireSupabase()
  const { data: events, error } = await client.from('trade_events').select('id,screenshot_id,event_time,raw_data')
    .eq('user_id', userId).eq('event_type', 'OPEN').is('trade_id', null)
    .order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  const matches = (events ?? []).filter(event => {
    const raw = event.raw_data as Record<string, unknown>
    return normalizeSymbol(typeof raw.symbol === 'string' ? raw.symbol : undefined) === symbol
      && (!data.eventTime || !event.event_time || Date.parse(event.event_time) <= Date.parse(data.eventTime))
  })
  return matches[0] ?? null
}

async function attachPendingOpenEvent(event: { id: string; screenshot_id: string | null }, userId: string, tradeId: string) {
  const client = requireSupabase()
  const { error } = await client.from('trade_events').update({ trade_id: tradeId }).eq('id', event.id).eq('user_id', userId)
  if (error) throw error
  if (event.screenshot_id) {
    const { error: screenshotError } = await client.from('screenshots').update({
      trade_id: tradeId, extraction_status: 'COMPLETED',
    }).eq('id', event.screenshot_id).eq('user_id', userId)
    if (screenshotError) throw screenshotError
  }
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

export async function applyExtraction(screenshotId: string, data: ExtractedTradeData, selectedTradeId?: string): Promise<string | null> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const trades = await listCurrentTrades()
  const screenshotRow = await client.from('screenshots').select('id').eq('id', screenshotId).eq('user_id', userId).single()
  if (screenshotRow.error) throw screenshotRow.error

  const duplicateTradeId = await detectDuplicateTransaction(userId, data)
  if (duplicateTradeId) {
    await client.from('screenshots').update({ trade_id: duplicateTradeId, extraction_status: 'COMPLETED' }).eq('id', screenshotId).eq('user_id', userId)
    await recordEvent(screenshotId, duplicateTradeId, data, data.screenshotType === 'CLOSE_TRANSACTION' ? 'CLOSE' : eventTypeFor(data.screenshotType))
    return duplicateTradeId
  }

  let matched: Trade | null = selectedTradeId ? trades.find(trade => trade.id === selectedTradeId) ?? null : null
  if (matched && data.screenshotType !== 'PNL' && matched.status !== 'OPEN') matched = null
  const eventType: TradeEventType = eventTypeFor(data.screenshotType)
  if (data.screenshotType === 'UNKNOWN') {
    await client.from('screenshots').update({ trade_id: null, extraction_status: 'EXTRACTED' }).eq('id', screenshotId).eq('user_id', userId)
    return null
  }
  if (!matched && data.screenshotType === 'OPEN_TRANSACTION') matched = findDuplicateOpenTrade(trades, data)
  if (!matched && data.screenshotType === 'OPEN_TRANSACTION') matched = findUniqueOpenTrade(trades, data)
  if (!matched && data.screenshotType === 'OPEN_TRANSACTION') matched = findTradeForOpenTransaction(trades, data)
  if (!matched && data.screenshotType === 'CLOSE_TRANSACTION') matched = findOpenTradeForClose(trades, data)
  if (!matched && data.screenshotType === 'POSITION_DETAILS') matched = findOpenTradeForPositionDetails(trades, data)
  if (!matched && data.screenshotType === 'PNL') matched = findTradeForPnl(trades, data)

  if (!matched && data.screenshotType === 'POSITION_DETAILS' && data.symbol && data.direction) {
    const pendingOpen = await findPendingOpenEvent(userId, data)
    const pendingData = pendingOpen?.raw_data as Partial<ExtractedTradeData> | undefined
    const combined: ExtractedTradeData = {
      ...(pendingData ?? {}),
      ...data,
      screenshotType: 'OPEN_TRANSACTION',
      eventTime: typeof pendingData?.eventTime === 'string' ? pendingData.eventTime : data.eventTime,
    }
    matched = await insertTrade(toDraft(combined))
    if (pendingOpen) await attachPendingOpenEvent(pendingOpen, userId, matched.id)
  }

  if (data.screenshotType === 'OPEN_TRANSACTION' && !matched && data.symbol && data.direction) {
    matched = await insertTrade(toDraft(data))
  } else if (matched && data.screenshotType === 'OPEN_TRANSACTION') {
    // An Open transaction may arrive before side/position details. Keep its facts and fill missing identity only.
    const resolvedOpenTime = matched.openTime ?? data.eventTime ?? null
    const resolvedHoldingSeconds = matched.status === 'CLOSED' && matched.closeTime && resolvedOpenTime
      ? Math.max(0, Math.floor((Date.parse(matched.closeTime) - Date.parse(resolvedOpenTime)) / 1000))
      : null
    const patch = {
      ...(matched.openTime == null && data.eventTime ? { openTime: data.eventTime } : {}),
      ...(matched.openTransactionId == null && data.transactionId ? { openTransactionId: data.transactionId } : {}),
      ...(matched.marketType == null && data.marketType ? { marketType: data.marketType } : {}),
      ...(matched.avgEntry == null && data.transactionPrice != null ? { avgEntry: data.transactionPrice } : {}),
      ...(resolvedHoldingSeconds != null ? {
        holdingDurationSeconds: resolvedHoldingSeconds,
        holdingDurationDisplay: formatDuration(resolvedHoldingSeconds),
      } : {}),
    }
    if (Object.keys(patch).length) matched = await updateTradeFromExtraction(matched.id, patch)
  } else if (matched && data.screenshotType === 'POSITION_DETAILS') {
    matched = await updateTradeFromExtraction(matched.id, nonNullPatch(data))
  } else if (matched && data.screenshotType === 'CLOSE_TRANSACTION') {
    const closePrice = data.closePrice ?? data.transactionPrice ?? null
    const closeTime = data.eventTime ?? null
    const closeReason = determineCloseReason(matched.direction, closePrice, matched.takeProfit, matched.stopLoss)
    const pnlAmount = data.pnlAmount ?? calculateSpotPnl(matched.direction, matched.avgEntry, closePrice, matched.quantity, matched.marketType)
    const dedicatedPnl = await getDedicatedPnlPercentage(userId, matched.id)
    const pnlPercentage = resolvePnlPercentage(dedicatedPnl, data.pnlPercentage, matched.pnlPercentage, pnlAmount, matched.margin)
    const holdingSeconds = matched.openTime && closeTime ? Math.max(0, Math.floor((Date.parse(closeTime) - Date.parse(matched.openTime)) / 1000)) : null
    matched = await updateTradeFromExtraction(matched.id, {
      status: 'CLOSED', closeTime, closePrice, closeReason, closeTransactionId: data.transactionId ?? null,
      ...(pnlAmount != null ? { pnlAmount } : {}), pnlPercentage,
      holdingDurationSeconds: Number.isFinite(holdingSeconds) ? holdingSeconds : null,
      holdingDurationDisplay: formatDuration(holdingSeconds),
    })
  } else if (matched && data.screenshotType === 'PNL') {
    const pnlPercentage = resolvePnlPercentage(data.pnlPercentage, null, matched.pnlPercentage, matched.pnlAmount, matched.margin)
    matched = await updateTradeFromExtraction(matched.id, { pnlPercentage })
  }

  const tradeId = matched?.id ?? null
  const eventKind: TradeEventType = data.screenshotType === 'CLOSE_TRANSACTION' ? 'CLOSE' : eventType
  if (tradeId) await client.from('screenshots').update({ extraction_status: 'MATCHED' }).eq('id', screenshotId).eq('user_id', userId)
  await recordEvent(screenshotId, tradeId, data, eventKind)
  await client.from('screenshots').update({
    trade_id: tradeId,
    extraction_status: tradeId ? 'COMPLETED' : 'EXTRACTED',
    screenshot_type: data.screenshotType,
    extracted_at: new Date().toISOString(),
    extraction_raw_data: toJsonObject(data),
    extraction_confidence: data.confidence ?? null,
  }).eq('id', screenshotId).eq('user_id', userId)
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

async function recordEvent(screenshotId: string, tradeId: string | null, data: ExtractedTradeData, eventType: TradeEventType) {
  await recordTradeEvent({
    screenshotId, tradeId, eventType, eventTime: data.eventTime ?? undefined,
    price: data.closePrice ?? data.transactionPrice ?? data.avgEntry ?? undefined,
    percentage: data.pnlPercentage ?? undefined, rawData: toJsonObject(data),
  })
}
