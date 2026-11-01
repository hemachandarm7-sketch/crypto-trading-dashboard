import type { Database, Json } from '../types/database.types'
import type { IpoDraft, IpoExtraction, IpoExtractionKind, IpoExtractionStatus, IpoTrade } from '../types/ipo'
import { ensureSupabaseUser, requireSupabase } from './supabaseClient'

type IpoRow = Database['public']['Tables']['ipo_trades']['Row']
type IpoInsertRow = Database['public']['Tables']['ipo_trades']['Insert']
type ExtractionRow = Database['public']['Tables']['ipo_extractions']['Row']

/** PostgREST returns numeric columns as JSON numbers, but be defensive about string numerics. */
const num = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function mapIpoTrade(row: IpoRow): IpoTrade {
  return {
    id: row.id, companyName: row.company_name, symbol: row.symbol, exchange: row.exchange, ipoType: row.ipo_type,
    mandateType: row.mandate_type, bidType: row.bid_type, applicationNumber: row.application_number, dpId: row.dp_id,
    clientId: row.client_id, holdAccountMasked: row.hold_account_masked, openDate: row.open_date, closeDate: row.close_date,
    priceBandLow: num(row.price_band_low), priceBandHigh: num(row.price_band_high), cutoffPrice: num(row.cutoff_price),
    appliedPrice: num(row.applied_price), issuePrice: num(row.issue_price), lotSize: num(row.lot_size), lots: num(row.lots),
    quantity: num(row.quantity), applicationAmount: num(row.application_amount), blockedAmount: num(row.blocked_amount),
    status: row.status, allotmentDate: row.allotment_date, allottedQuantity: num(row.allotted_quantity),
    refundAmount: num(row.refund_amount), listingDate: row.listing_date, listingPrice: num(row.listing_price),
    currentPrice: num(row.current_price), currentPriceAt: row.current_price_at, currentPriceSource: row.current_price_source,
    exitPrice: num(row.exit_price), exitQuantity: num(row.exit_quantity), exitDate: row.exit_date, exitCharges: num(row.exit_charges),
    notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

const blank = (value: string | null | undefined): string | null => { const trimmed = value?.trim(); return trimmed ? trimmed : null }

/** Explicit field-by-field mapping so unknowns stay NULL and camelCase never leaks into a column name. */
export function mapIpoDraftToRow(draft: IpoDraft, userId: string): IpoInsertRow {
  return {
    user_id: userId, company_name: draft.companyName.trim(), symbol: blank(draft.symbol)?.toUpperCase() ?? null, exchange: blank(draft.exchange),
    ipo_type: draft.ipoType, mandate_type: draft.mandateType, bid_type: draft.bidType,
    application_number: blank(draft.applicationNumber)?.toUpperCase() ?? null, dp_id: blank(draft.dpId), client_id: blank(draft.clientId),
    hold_account_masked: blank(draft.holdAccountMasked), open_date: draft.openDate, close_date: draft.closeDate,
    price_band_low: draft.priceBandLow, price_band_high: draft.priceBandHigh, cutoff_price: draft.cutoffPrice,
    applied_price: draft.appliedPrice, issue_price: draft.issuePrice, lot_size: draft.lotSize, lots: draft.lots, quantity: draft.quantity,
    application_amount: draft.applicationAmount, blocked_amount: draft.blockedAmount, status: draft.status,
    allotment_date: draft.allotmentDate, allotted_quantity: draft.allottedQuantity, refund_amount: draft.refundAmount,
    listing_date: draft.listingDate, listing_price: draft.listingPrice, current_price: draft.currentPrice,
    current_price_at: draft.currentPrice == null ? null : draft.currentPriceAt,
    current_price_source: draft.currentPrice == null ? null : draft.currentPriceSource,
    exit_price: draft.exitPrice, exit_quantity: draft.exitQuantity, exit_date: draft.exitDate, exit_charges: draft.exitCharges,
    notes: blank(draft.notes),
  }
}

export function mapIpoExtraction(row: ExtractionRow): IpoExtraction {
  return {
    id: row.id, ipoTradeId: row.ipo_trade_id, kind: row.kind, status: row.status, originalName: row.original_name, sha256: row.sha256,
    rawText: row.raw_text, ocrConfidence: num(row.ocr_confidence), parsed: (row.parsed ?? {}) as Record<string, unknown>,
    confirmed: (row.confirmed ?? null) as Record<string, unknown> | null, createdAt: row.created_at,
  }
}

/** Postgres unique_violation on (user_id, application_number). */
function friendlyError(error: { code?: string; message?: string }): Error {
  if (error.code === '23505') return new Error('An IPO with this application number is already saved. Open it from the list instead of adding it again.')
  if (error.code === '23514') return new Error(`The database rejected a value: ${error.message ?? 'a check constraint failed'}.`)
  return error instanceof Error ? error : new Error(error.message ?? 'The IPO request failed.')
}

export async function listIpoTrades(): Promise<IpoTrade[]> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('ipo_trades').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw friendlyError(error)
  return (data ?? []).map(mapIpoTrade)
}

export async function insertIpoTrade(draft: IpoDraft): Promise<IpoTrade> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('ipo_trades').insert(mapIpoDraftToRow(draft, userId)).select('*').single()
  if (error) throw friendlyError(error)
  return mapIpoTrade(data)
}

export async function updateIpoTrade(id: string, draft: IpoDraft): Promise<IpoTrade> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { user_id: _owner, ...patch } = mapIpoDraftToRow(draft, userId)
  void _owner
  const { data, error } = await client.from('ipo_trades').update(patch).eq('id', id).eq('user_id', userId).select('*').single()
  if (error) throw friendlyError(error)
  return mapIpoTrade(data)
}

export async function removeIpoTrade(id: string): Promise<void> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { error } = await client.from('ipo_trades').delete().eq('id', id).eq('user_id', userId)
  if (error) throw friendlyError(error)
}

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export interface SaveExtractionInput {
  kind: IpoExtractionKind
  status: IpoExtractionStatus
  ipoTradeId: string | null
  originalName: string | null
  sha256: string | null
  rawText: string
  ocrConfidence: number | null
  parsed: Record<string, unknown>
  confirmed: Record<string, unknown> | null
}

/** Stores the verbatim OCR text, the parser output and what the user finally confirmed. */
export async function saveIpoExtraction(input: SaveExtractionInput): Promise<IpoExtraction> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const row = {
    user_id: userId, ipo_trade_id: input.ipoTradeId, kind: input.kind, status: input.status, original_name: input.originalName,
    sha256: input.sha256, raw_text: input.rawText, ocr_confidence: input.ocrConfidence, parsed: input.parsed as Json, confirmed: input.confirmed as Json | null,
  }
  const { data, error } = await client.from('ipo_extractions').insert(row).select('*').single()
  if (error) throw friendlyError(error)
  return mapIpoExtraction(data)
}

/** Has this exact image already been processed as this kind of document? */
export async function findIpoExtractionByHash(sha256: string, kind: IpoExtractionKind): Promise<IpoExtraction | null> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('ipo_extractions').select('*').eq('user_id', userId).eq('sha256', sha256).eq('kind', kind).maybeSingle()
  if (error) throw friendlyError(error)
  return data ? mapIpoExtraction(data) : null
}

export async function listIpoExtractions(ipoTradeId: string): Promise<IpoExtraction[]> {
  const client = requireSupabase()
  const userId = await ensureSupabaseUser()
  const { data, error } = await client.from('ipo_extractions').select('*').eq('user_id', userId).eq('ipo_trade_id', ipoTradeId).order('created_at', { ascending: false })
  if (error) throw friendlyError(error)
  return (data ?? []).map(mapIpoExtraction)
}
