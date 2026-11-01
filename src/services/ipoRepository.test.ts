import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({ client: { from: vi.fn() } }))
vi.mock('./supabaseClient', () => ({
  requireSupabase: () => supabaseMock.client,
  ensureSupabaseUser: async () => 'user-uuid',
}))

import { findIpoExtractionByHash, insertIpoTrade, listIpoExtractions, listIpoTrades, mapIpoDraftToRow, mapIpoTrade, removeIpoTrade, saveIpoExtraction, sha256Hex, updateIpoTrade } from './ipoRepository'
import { emptyIpoDraft, type IpoDraft } from '../types/ipo'

type Call = [string, ...unknown[]]
/** Minimal chainable PostgREST stand-in that records every call and resolves to `result`. */
function chain(result: { data: unknown; error: unknown }) {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    builder[method] = vi.fn((...args: unknown[]) => { calls.push([method, ...args]); return builder })
  }
  builder.single = vi.fn(async () => result)
  builder.maybeSingle = vi.fn(async () => result)
  builder.then = (resolveFn: (value: unknown) => unknown) => Promise.resolve(result).then(resolveFn)
  return { builder, calls }
}

const savedRow = {
  id: 'ipo-1', user_id: 'user-uuid', company_name: 'Bombay Coated and Special Steels Limited', symbol: null, exchange: null,
  ipo_type: null, mandate_type: 'ASBA', bid_type: null, application_number: '179346627148EFAV', dp_id: 'IN300214', client_id: '96648025',
  hold_account_masked: 'xxxx2284', open_date: null, close_date: null, price_band_low: null, price_band_high: null, cutoff_price: null,
  applied_price: 82, issue_price: null, lot_size: null, lots: null, quantity: 182, application_amount: '14924.00', blocked_amount: 14924,
  status: 'APPLIED', allotment_date: null, allotted_quantity: null, refund_amount: null, listing_date: null, listing_price: null,
  current_price: null, current_price_at: null, current_price_source: null, exit_price: null, exit_quantity: null, exit_date: null, exit_charges: null,
  notes: null, created_at: '2026-10-31T09:00:00Z', updated_at: '2026-10-31T09:00:00Z',
}

const draft = (): IpoDraft => ({
  ...emptyIpoDraft(), companyName: '  Bombay Coated and Special Steels Limited ', applicationNumber: ' 179346627148efav ', symbol: ' bcssl ',
  mandateType: 'ASBA', quantity: 182, appliedPrice: 82, applicationAmount: 14924, blockedAmount: 14924, dpId: 'IN300214', clientId: '96648025', notes: '   ',
})

beforeEach(() => { supabaseMock.client.from.mockReset() })

describe('row mapping', () => {
  it('maps snake_case to camelCase, coerces string numerics and keeps unknowns null', () => {
    const trade = mapIpoTrade(savedRow as never)
    expect(trade).toMatchObject({ id: 'ipo-1', companyName: 'Bombay Coated and Special Steels Limited', applicationNumber: '179346627148EFAV', quantity: 182, appliedPrice: 82, applicationAmount: 14924, blockedAmount: 14924, status: 'APPLIED', mandateType: 'ASBA' })
    expect(trade.allottedQuantity).toBeNull()
    expect(trade.refundAmount).toBeNull()
    expect(trade.currentPrice).toBeNull()
  })
  it('normalises the draft: trims, upper-cases identifiers, turns blanks into NULL, never defaults numbers to 0', () => {
    const row = mapIpoDraftToRow(draft(), 'user-uuid')
    expect(row).toMatchObject({ user_id: 'user-uuid', company_name: 'Bombay Coated and Special Steels Limited', application_number: '179346627148EFAV', symbol: 'BCSSL', notes: null, allotted_quantity: null, refund_amount: null, issue_price: null, status: 'APPLIED' })
    expect(Object.keys(row).filter(key => /[A-Z]/.test(key))).toEqual([]) // no camelCase leaking into columns
  })
  it('drops the price timestamp/source when there is no price, to satisfy the DB check', () => {
    const row = mapIpoDraftToRow({ ...draft(), currentPrice: null, currentPriceAt: '2026-11-01T00:00:00Z', currentPriceSource: 'MANUAL' }, 'user-uuid')
    expect(row.current_price_at).toBeNull()
    expect(row.current_price_source).toBeNull()
  })
  it('keeps price, timestamp and source together when a price exists', () => {
    const row = mapIpoDraftToRow({ ...draft(), status: 'LISTED', currentPrice: 104.35, currentPriceAt: '2026-11-12T10:00:00Z', currentPriceSource: 'SCREENSHOT' }, 'user-uuid')
    expect(row).toMatchObject({ current_price: 104.35, current_price_at: '2026-11-12T10:00:00Z', current_price_source: 'SCREENSHOT' })
  })
})

describe('database operations', () => {
  it('lists only the signed-in user’s IPOs', async () => {
    const { builder, calls } = chain({ data: [savedRow], error: null })
    supabaseMock.client.from.mockReturnValue(builder)
    const result = await listIpoTrades()
    expect(supabaseMock.client.from).toHaveBeenCalledWith('ipo_trades')
    expect(calls).toContainEqual(['eq', 'user_id', 'user-uuid'])
    expect(result).toHaveLength(1)
    expect(result[0].companyName).toBe('Bombay Coated and Special Steels Limited')
  })
  it('inserts with the authenticated user id and returns the mapped row', async () => {
    const { builder, calls } = chain({ data: savedRow, error: null })
    supabaseMock.client.from.mockReturnValue(builder)
    const saved = await insertIpoTrade(draft())
    const insertCall = calls.find(call => call[0] === 'insert')
    expect(insertCall?.[1]).toMatchObject({ user_id: 'user-uuid', application_number: '179346627148EFAV', quantity: 182 })
    expect(saved.id).toBe('ipo-1')
  })
  it('turns a duplicate application number into a clear message', async () => {
    const { builder } = chain({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    supabaseMock.client.from.mockReturnValue(builder)
    await expect(insertIpoTrade(draft())).rejects.toThrow(/already saved/)
  })
  it('surfaces check-constraint failures', async () => {
    const { builder } = chain({ data: null, error: { code: '23514', message: 'new row violates check constraint "ipo_trades_dates_order"' } })
    supabaseMock.client.from.mockReturnValue(builder)
    await expect(insertIpoTrade(draft())).rejects.toThrow(/rejected a value/)
  })
  it('updates scoped by id AND user_id, and never sends user_id in the patch', async () => {
    const { builder, calls } = chain({ data: savedRow, error: null })
    supabaseMock.client.from.mockReturnValue(builder)
    await updateIpoTrade('ipo-1', draft())
    expect(calls).toContainEqual(['eq', 'id', 'ipo-1'])
    expect(calls).toContainEqual(['eq', 'user_id', 'user-uuid'])
    expect(calls.find(call => call[0] === 'update')?.[1]).not.toHaveProperty('user_id')
  })
  it('deletes scoped by id AND user_id', async () => {
    const { builder, calls } = chain({ data: null, error: null })
    supabaseMock.client.from.mockReturnValue(builder)
    await removeIpoTrade('ipo-1')
    expect(calls).toContainEqual(['delete'])
    expect(calls).toContainEqual(['eq', 'id', 'ipo-1'])
    expect(calls).toContainEqual(['eq', 'user_id', 'user-uuid'])
  })
  it('propagates unexpected errors', async () => {
    const { builder } = chain({ data: null, error: Object.assign(new Error('network down'), { code: '08006' }) })
    supabaseMock.client.from.mockReturnValue(builder)
    await expect(listIpoTrades()).rejects.toThrow('network down')
  })
})

describe('raw OCR preservation', () => {
  const extractionRow = { id: 'x1', user_id: 'user-uuid', ipo_trade_id: 'ipo-1', kind: 'APPLICATION', status: 'CONFIRMED', original_name: 'kotak.jpeg', sha256: 'abc', raw_text: 'raw OCR…', ocr_confidence: 0.93, parsed: { a: 1 }, confirmed: { a: 2 }, created_at: '2026-10-31T09:00:00Z' }
  it('stores verbatim raw text, parser output and the user-confirmed values', async () => {
    const { builder, calls } = chain({ data: extractionRow, error: null })
    supabaseMock.client.from.mockReturnValue(builder)
    const saved = await saveIpoExtraction({ kind: 'APPLICATION', status: 'CONFIRMED', ipoTradeId: 'ipo-1', originalName: 'kotak.jpeg', sha256: 'abc', rawText: 'raw OCR…', ocrConfidence: 0.93, parsed: { a: 1 }, confirmed: { a: 2 } })
    expect(supabaseMock.client.from).toHaveBeenCalledWith('ipo_extractions')
    expect(calls.find(call => call[0] === 'insert')?.[1]).toMatchObject({ user_id: 'user-uuid', raw_text: 'raw OCR…', parsed: { a: 1 }, confirmed: { a: 2 }, ocr_confidence: 0.93 })
    expect(saved).toMatchObject({ rawText: 'raw OCR…', parsed: { a: 1 }, confirmed: { a: 2 }, ocrConfidence: 0.93 })
  })
  it('detects an already-processed image by hash and kind', async () => {
    const { builder, calls } = chain({ data: extractionRow, error: null })
    supabaseMock.client.from.mockReturnValue(builder)
    expect((await findIpoExtractionByHash('abc', 'APPLICATION'))?.id).toBe('x1')
    expect(calls).toContainEqual(['eq', 'sha256', 'abc'])
    expect(calls).toContainEqual(['eq', 'kind', 'APPLICATION'])
  })
  it('returns null when the image is new', async () => {
    const { builder } = chain({ data: null, error: null })
    supabaseMock.client.from.mockReturnValue(builder)
    expect(await findIpoExtractionByHash('zzz', 'PRICE')).toBeNull()
  })
  it('lists extractions for one IPO', async () => {
    const { builder, calls } = chain({ data: [extractionRow], error: null })
    supabaseMock.client.from.mockReturnValue(builder)
    expect(await listIpoExtractions('ipo-1')).toHaveLength(1)
    expect(calls).toContainEqual(['eq', 'ipo_trade_id', 'ipo-1'])
  })
  it('hashes files deterministically with SHA-256', async () => {
    expect(await sha256Hex(new Blob(['hello']))).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})

describe('migration 012 safety', () => {
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/012_ipo_tracking.sql'), 'utf8')
  const code = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').toLowerCase()
  it('is additive only: never drops, truncates, deletes or alters existing trade data', () => {
    expect(code).not.toMatch(/drop\s+table|truncate|delete\s+from|drop\s+column|alter\s+table\s+public\.(trades|screenshots|trade_events|user_settings)\b/)
    expect(code).not.toMatch(/update\s+public\./)
  })
  it('is idempotent', () => {
    expect(code).toMatch(/create table if not exists public\.ipo_trades/)
    expect(code).toMatch(/create table if not exists public\.ipo_extractions/)
    expect(code).toMatch(/drop policy if exists "users manage their ipo trades"/)
    expect(code.match(/create index (?:unique )?if not exists|create unique index if not exists/g)?.length).toBeGreaterThanOrEqual(5)
  })
  it('enables RLS and scopes both tables to the owner with the existing convention', () => {
    expect(code).toMatch(/alter table public\.ipo_trades enable row level security/)
    expect(code).toMatch(/alter table public\.ipo_extractions enable row level security/)
    expect((code.match(/\(select auth\.uid\(\)\) = user_id/g) ?? []).length).toBeGreaterThanOrEqual(4) // using + with check, x2 tables
    expect(code).toMatch(/for all to authenticated/)
    expect(code).not.toMatch(/to anon|to public|using \(true\)/)
  })
  it('cascades deletes from auth.users and enforces status values and price provenance', () => {
    expect((code.match(/references auth\.users\(id\) on delete cascade/g) ?? []).length).toBe(2)
    expect(code).toMatch(/status in \('applied', 'allotted', 'partially_allotted', 'not_allotted', 'listed'\)/)
    expect(code).toMatch(/ipo_trades_price_requires_timestamp/)
  })
  it('prevents duplicate application numbers per user', () => {
    expect(code).toMatch(/unique index if not exists ipo_trades_user_application_unique_idx\s+on public\.ipo_trades \(user_id, application_number\) where application_number is not null/)
  })
})
