import type { TradeEvent, UserSettings } from '../types'
import type { Database, Json } from '../types/database.types'
import { ensureSupabaseUser, requireSupabase } from './supabaseClient'
import type { Screenshot, Trade } from '../types'

type TradeRow = Database['public']['Tables']['trades']['Row']
type ScreenshotRow = Database['public']['Tables']['screenshots']['Row']
type TradeInsertRow = Database['public']['Tables']['trades']['Insert']
export type TradeDraft = Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>
export type TradeUpdate = Partial<TradeDraft>

const trace = (...values: unknown[]) => { if (import.meta.env.DEV) console.debug(...values) }

function databaseError(context: string, error: { message: string; code?: string; details?: string; hint?: string }): Error {
  trace(`[${context}] error`, { code: error.code, message: error.message, details: error.details, hint: error.hint })
  const code = error.code ? ` (${error.code})` : ''
  const details = error.details ? ` Details: ${error.details}` : ''
  const hint = error.hint ? ` Hint: ${error.hint}` : ''
  return new Error(`${context}${code}: ${error.message}${details}${hint}`)
}

export function mapTrade(row: TradeRow): Trade {
  return {
    id: row.id, symbol: row.symbol, exchange: row.exchange, marketType: row.market_type, direction: row.direction,
    leverage: row.leverage, quantity: row.quantity, size: row.size, margin: row.margin, avgEntry: row.avg_entry,
    ltp: row.ltp, liquidationPrice: row.liquidation_price, takeProfit: row.take_profit, stopLoss: row.stop_loss,
    openTime: row.open_time, closeTime: row.close_time, holdingDurationSeconds: row.holding_duration_seconds,
    holdingDurationDisplay: row.holding_duration_display, closePrice: row.close_price, pnlAmount: row.pnl_amount,
    pnlPercentage: row.pnl_percentage, status: row.status, closeReason: row.close_reason, setup: row.setup,
    notes: row.notes, exchangePositionId: row.exchange_position_id, openTransactionId: row.open_transaction_id,
    closeTransactionId: row.close_transaction_id, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export function mapScreenshot(row: ScreenshotRow, previewUrl?: string): Screenshot {
  return {
    id: row.id, tradeId: row.trade_id, storagePath: row.storage_path, screenshotType: row.screenshot_type,
    uploadedAt: row.uploaded_at, extractedAt: row.extracted_at, extractionStatus: row.extraction_status,
    extractionRawData: row.extraction_raw_data && typeof row.extraction_raw_data === 'object' && !Array.isArray(row.extraction_raw_data) ? row.extraction_raw_data as Record<string, unknown> : null,
    extractionConfidence: row.extraction_confidence, sha256: row.sha256, originalName: row.original_name,
    contentType: row.content_type, sizeBytes: row.size_bytes, previewUrl,
  }
}

export async function listTrades(): Promise<Trade[]> {
  const [client, userId] = [requireSupabase(), await ensureSupabaseUser()]
  const { data, error } = await client.from('trades').select('*').eq('user_id', userId).order('open_time', { ascending: false, nullsFirst: false })
  if (error) throw error
  trace('[TRADE FETCH]', { count: data?.length ?? 0 })
  return (data ?? []).map(mapTrade)
}

export async function insertTrade(draft: TradeDraft, idempotencyKey?: string): Promise<Trade> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const payload = mapFormToTradeInsert(draft, userId, idempotencyKey)
  const safePayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'user_id'))
  trace('[TRADE PAYLOAD]', safePayload)
  trace('[SUPABASE INSERT]', {
    table: 'trades', requested: true, userId, tradeId: payload.id ?? null,
    symbol: payload.symbol, direction: payload.direction, status: payload.status, leverage: payload.leverage,
    entry: payload.avg_entry, close: payload.close_price, margin: payload.margin, size: payload.size,
    quantity: payload.quantity, pnl: payload.pnl_amount, currency: 'USD',
  })
  const { data, error } = await client.from('trades').insert(payload).select('*').single()
  if (error) {
    if (idempotencyKey && error.code === '23505') {
      const { data: existing, error: lookupError } = await client.from('trades').select('*')
        .eq('id', idempotencyKey).eq('user_id', userId).maybeSingle()
      if (lookupError) throw databaseError('Supabase trade retry lookup failed', lookupError)
      if (existing) {
        trace('[SUPABASE IDEMPOTENT RETRY]', { id: existing.id, userId })
        return mapTrade(existing)
      }
    }
    throw databaseError('Supabase trade insert failed', error)
  }
  if (!data) throw new Error('Supabase trade insert returned no saved trade row.')
  trace('[SUPABASE RESPONSE]', { operation: 'insert', id: data.id, status: data.status })
  return mapTrade(data)
}

export async function updateTrade(id: string, patch: TradeUpdate): Promise<Trade> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const payload = toTradeRow(patch)
  trace('[SUPABASE UPDATE]', { table: 'trades', id, payload })
  const { data, error } = await client.from('trades').update(payload).eq('id', id).eq('user_id', userId).select('*').single()
  if (error) throw databaseError('Supabase trade update failed', error)
  trace('[SUPABASE RESPONSE]', { operation: 'update', id: data.id, status: data.status })
  return mapTrade(data)
}

export async function removeTrade(id: string): Promise<void> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { error } = await client.from('trades').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}

export function mapFormToTradeInsert(trade: TradeDraft, userId: string, idempotencyKey?: string): TradeInsertRow {
  return {
    ...(idempotencyKey ? { id: idempotencyKey } : {}),
    user_id: userId,
    trade_code: null,
    coin: trade.symbol.trim().split(/[/_-]/, 1)[0] || null,
    symbol: trade.symbol,
    exchange: trade.exchange,
    market_type: trade.marketType,
    direction: trade.direction,
    leverage: trade.leverage,
    quantity: trade.quantity,
    size: trade.size,
    margin: trade.margin,
    avg_entry: trade.avgEntry,
    ltp: trade.ltp,
    liquidation_price: trade.liquidationPrice,
    take_profit: trade.takeProfit,
    stop_loss: trade.stopLoss,
    open_time: trade.openTime,
    close_time: trade.closeTime,
    holding_duration_seconds: trade.holdingDurationSeconds,
    holding_duration_display: trade.holdingDurationDisplay,
    close_price: trade.closePrice,
    pnl_amount: trade.pnlAmount,
    pnl_percentage: trade.pnlPercentage,
    status: trade.status,
    close_reason: trade.closeReason,
    setup: trade.setup,
    notes: trade.notes,
    exchange_position_id: trade.exchangePositionId,
    open_transaction_id: trade.openTransactionId,
    close_transaction_id: trade.closeTransactionId,
  }
}

function toTradeRow(trade: Partial<TradeDraft>): Partial<TradeRow> {
  const fields: Partial<TradeRow> = {}
  const mapping = {
    symbol: 'symbol', exchange: 'exchange', marketType: 'market_type', direction: 'direction', leverage: 'leverage',
    quantity: 'quantity', size: 'size', margin: 'margin', avgEntry: 'avg_entry', ltp: 'ltp',
    liquidationPrice: 'liquidation_price', takeProfit: 'take_profit', stopLoss: 'stop_loss', openTime: 'open_time',
    closeTime: 'close_time', holdingDurationSeconds: 'holding_duration_seconds', holdingDurationDisplay: 'holding_duration_display',
    closePrice: 'close_price', pnlAmount: 'pnl_amount', pnlPercentage: 'pnl_percentage', status: 'status',
    closeReason: 'close_reason', setup: 'setup', notes: 'notes', exchangePositionId: 'exchange_position_id',
    openTransactionId: 'open_transaction_id', closeTransactionId: 'close_transaction_id',
  } as const
  for (const [key, column] of Object.entries(mapping) as [keyof typeof mapping, typeof mapping[keyof typeof mapping]][]) {
    if (key in trade) (fields as Record<string, unknown>)[column] = trade[key]
  }
  return fields
}

async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function listScreenshots(): Promise<Screenshot[]> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('screenshots').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false })
  if (error) throw error
  return Promise.all((data ?? []).map(async row => {
    const { data: signed, error: signedError } = await client.storage.from('trade-screenshots').createSignedUrl(row.storage_path, 3600)
    if (signedError) return mapScreenshot(row)
    return mapScreenshot(row, signed.signedUrl)
  }))
}

export async function downloadScreenshotFile(screenshot: Screenshot): Promise<File> {
  const client = requireSupabase()
  const { data, error } = await client.storage.from('trade-screenshots').download(screenshot.storagePath)
  if (error) throw error
  return new File([data], screenshot.originalName, { type: screenshot.contentType })
}

export async function listTradeEvents(tradeId: string): Promise<TradeEvent[]> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('trade_events').select('*').eq('user_id', userId).eq('trade_id', tradeId).order('event_time', { ascending: true, nullsFirst: true })
  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id, tradeId: row.trade_id!, eventType: row.event_type, eventTime: row.event_time,
    price: row.price, percentage: row.percentage,
    rawData: row.raw_data && typeof row.raw_data === 'object' && !Array.isArray(row.raw_data) ? row.raw_data as Record<string, unknown> : {},
    screenshotId: row.screenshot_id, createdAt: row.created_at,
  }))
}

export async function uploadScreenshot(file: File): Promise<{ screenshot: Screenshot; duplicate: boolean }> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG, JPEG, or WEBP image.')
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Screenshot files must be 10 MB or smaller.')
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const sha256 = await hashFile(file)
  const { data: prior, error: lookupError } = await client.from('screenshots').select('*').eq('user_id', userId).eq('sha256', sha256).maybeSingle()
  if (lookupError) throw lookupError
  if (prior) {
    const { data: signed } = await client.storage.from('trade-screenshots').createSignedUrl(prior.storage_path, 3600)
    return { screenshot: mapScreenshot(prior, signed?.signedUrl), duplicate: true }
  }

  const id = crypto.randomUUID()
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const storagePath = `${userId}/${id}.${extension}`
  const { error: storageError } = await client.storage.from('trade-screenshots').upload(storagePath, file, { contentType: file.type, upsert: false })
  if (storageError) throw storageError
  const { data, error } = await client.from('screenshots').insert({
    id, user_id: userId, trade_id: null, storage_path: storagePath, screenshot_type: 'UNKNOWN',
    extraction_status: 'UPLOADED', sha256, original_name: file.name, content_type: file.type, size_bytes: file.size,
  }).select('*').single()
  if (error) {
    await client.storage.from('trade-screenshots').remove([storagePath])
    if (error.code === '23505') {
      const { data: duplicate } = await client.from('screenshots').select('*').eq('user_id', userId).eq('sha256', sha256).maybeSingle()
      if (duplicate) return { screenshot: mapScreenshot(duplicate), duplicate: true }
    }
    throw error
  }
  const { data: signed } = await client.storage.from('trade-screenshots').createSignedUrl(storagePath, 3600)
  return { screenshot: mapScreenshot(data, signed?.signedUrl), duplicate: false }
}

export async function deleteScreenshot(screenshot: Screenshot): Promise<void> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { error: storageError } = await client.storage.from('trade-screenshots').remove([screenshot.storagePath])
  if (storageError) throw storageError
  const { error } = await client.from('screenshots').delete().eq('id', screenshot.id).eq('user_id', userId)
  if (error) throw error
}

export async function updateScreenshot(id: string, patch: Database['public']['Tables']['screenshots']['Update']): Promise<void> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { error } = await client.from('screenshots').update(patch).eq('id', id).eq('user_id', userId)
  if (error) throw databaseError('Supabase screenshot update failed', error)
}

export async function associateScreenshot(screenshotId: string, tradeId: string | null): Promise<void> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { error } = await client.from('screenshots').update({ trade_id: tradeId }).eq('id', screenshotId).eq('user_id', userId)
  if (error) throw error
}

export const defaultUserSettings: UserSettings = { defaultLeverage: 3, defaultExchange: 'Binance', defaultMarket: 'Perpetual', currency: 'USD', theme: 'dark', defaultRange: '30 Days', analyticsView: 'Equity curve' }

export async function loadUserSettings(): Promise<UserSettings> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('user_settings').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return defaultUserSettings
  return { defaultLeverage: data.default_leverage, defaultExchange: data.default_exchange, defaultMarket: data.default_market, currency: 'USD', theme: data.theme, defaultRange: data.default_range, analyticsView: data.analytics_view }
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { error } = await client.from('user_settings').upsert({ user_id: userId, default_leverage: settings.defaultLeverage, default_exchange: settings.defaultExchange, default_market: settings.defaultMarket, currency: 'USD', theme: settings.theme, default_range: settings.defaultRange, analytics_view: settings.analyticsView })
  if (error) throw error
}

export async function recordTradeEvent(input: {
  tradeId: string; eventType: 'OPEN' | 'CLOSE' | 'PNL' | 'POSITION_DETAILS'; eventTime?: string
  price?: number; percentage?: number; screenshotId?: string | null; rawData: Record<string, unknown>
}): Promise<void> {
  const tradeId = requireTradeEventId(input.tradeId)
  const userId = await ensureSupabaseUser()
  const event = mapTradeEventInsert({ ...input, tradeId }, userId)
  const client = requireSupabase()
  if (input.screenshotId) {
    const { data: existing, error: lookupError } = await client.from('trade_events').select('id')
      .eq('user_id', userId).eq('screenshot_id', input.screenshotId).eq('event_type', input.eventType).maybeSingle()
    if (lookupError) throw databaseError('Could not check for an existing trade event', lookupError)
    if (existing) {
      const { error } = await client.from('trade_events').update(event).eq('id', existing.id).eq('user_id', userId)
      if (error) throw databaseError('Could not update the trade event', error)
      return
    }
  }
  const { error } = await client.from('trade_events').insert(event)
  if (error) {
    if (input.screenshotId && error.code === '23505') {
      const { data: existing, error: lookupError } = await client.from('trade_events').select('id')
        .eq('user_id', userId).eq('screenshot_id', input.screenshotId).eq('event_type', input.eventType).maybeSingle()
      if (lookupError) throw databaseError('Could not verify the retried trade event', lookupError)
      if (existing) {
        const { error: updateError } = await client.from('trade_events').update(event).eq('id', existing.id).eq('user_id', userId)
        if (updateError) throw databaseError('Could not update the retried trade event', updateError)
        return
      }
    }
    throw databaseError('Could not save the trade event', error)
  }
}

/** Refuse to issue a trade_events write unless the parent trade ID is known. */
export function requireTradeEventId(tradeId: string | null | undefined): string {
  if (typeof tradeId !== 'string' || !tradeId.trim()) {
    throw new Error('Cannot save trade event: the parent trade has not been created or matched.')
  }
  return tradeId
}

export function mapTradeEventInsert(input: {
  tradeId: string | null | undefined; eventType: 'OPEN' | 'CLOSE' | 'PNL' | 'POSITION_DETAILS'; eventTime?: string
  price?: number; percentage?: number; screenshotId?: string | null; rawData: Record<string, unknown>
}, userId: string) {
  return {
    user_id: userId,
    trade_id: requireTradeEventId(input.tradeId),
    event_type: input.eventType,
    event_time: input.eventTime ?? null,
    price: input.price ?? null,
    percentage: input.percentage ?? null,
    screenshot_id: input.screenshotId ?? null,
    raw_data: JSON.parse(JSON.stringify(input.rawData)) as Json,
  }
}

export async function updateTradeFromExtraction(id: string, patch: TradeUpdate): Promise<Trade> {
  return updateTrade(id, patch)
}
