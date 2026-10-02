import { describe, expect, it, vi } from 'vitest'
const supabaseMock = vi.hoisted(() => ({ client: { from: vi.fn() } }))
vi.mock('./supabaseClient', () => ({
  requireSupabase: () => supabaseMock.client,
  ensureSupabaseUser: async () => 'user-uuid',
}))
import { insertTrade, mapFormToTradeInsert, mapTradeEventInsert, recordTradeEvent, requireTradeEventId } from './tradeRepository'
import type { TradeDraft } from './tradeRepository'

const draft: TradeDraft = {
  symbol: 'RARE/USDT', exchange: 'CoinDCX', marketType: 'Futures', direction: 'SHORT', leverage: 10,
  quantity: 8073, size: 136.353, margin: 18.379, avgEntry: 0.0227, ltp: 0.01689,
  liquidationPrice: 0.02463, takeProfit: 0.01255, stopLoss: 0.01795,
  openTime: '2026-09-28T04:44:05.000Z', closeTime: null, holdingDurationSeconds: null,
  holdingDurationDisplay: null, closePrice: null, pnlAmount: null, pnlPercentage: null,
  status: 'OPEN', closeReason: null, setup: null, notes: null, exchangePositionId: null,
  openTransactionId: '8567564', closeTransactionId: null,
}

describe('mapFormToTradeInsert', () => {
  it('maps reviewed fields explicitly to the database columns and preserves unknowns as null', () => {
    expect(mapFormToTradeInsert(draft, 'user-uuid')).toMatchObject({
      user_id: 'user-uuid', trade_code: null, coin: 'RARE', symbol: 'RARE/USDT', direction: 'SHORT', leverage: 10,
      quantity: 8073, size: 136.353, margin: 18.379, avg_entry: 0.0227, ltp: 0.01689,
      liquidation_price: 0.02463, take_profit: 0.01255, stop_loss: 0.01795,
      open_time: '2026-09-28T04:44:05.000Z', close_time: null, close_price: null,
      pnl_amount: null, pnl_percentage: null, status: 'OPEN', open_transaction_id: '8567564',
    })
    const row = mapFormToTradeInsert(draft, 'user-uuid')
    expect(row).not.toHaveProperty('avgEntry')
    expect(row).not.toHaveProperty('takeProfit')
    expect(row).not.toHaveProperty('stopLoss')
  })

  it('uses a stable screenshot-derived trade ID when requested', () => {
    expect(mapFormToTradeInsert(draft, 'user-uuid', 'screenshot-id')).toMatchObject({ id: 'screenshot-id', user_id: 'user-uuid' })
  })
})

const savedTradeRow = {
  id: 'screenshot-id', symbol: 'RARE/USDT', exchange: 'CoinDCX', market_type: 'Futures', direction: 'SHORT',
  leverage: 10, quantity: 8073, size: 136.353, margin: 18.379, avg_entry: 0.0227, ltp: 0.01689,
  liquidation_price: 0.02463, take_profit: 0.01255, stop_loss: 0.01795, open_time: null, close_time: null,
  holding_duration_seconds: null, holding_duration_display: null, close_price: null, pnl_amount: null,
  pnl_percentage: null, status: 'OPEN', close_reason: null, setup: null, notes: null, exchange_position_id: null,
  open_transaction_id: null, close_transaction_id: null, created_at: '', updated_at: '',
}

function query(result: { data?: unknown; error?: { message: string; code?: string; details?: string; hint?: string } | null }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['insert', 'select', 'eq', 'update']) chain[method] = vi.fn(() => chain)
  chain.single = vi.fn(async () => result)
  chain.maybeSingle = vi.fn(async () => result)
  return chain
}

describe('insertTrade persistence', () => {
  it('waits for and maps the successful Supabase insert response', async () => {
    const table = query({ data: savedTradeRow, error: null })
    supabaseMock.client.from.mockReturnValueOnce(table)
    const saved = await insertTrade(draft, 'screenshot-id')
    expect(supabaseMock.client.from).toHaveBeenCalledWith('trades')
    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'screenshot-id', user_id: 'user-uuid' }))
    expect(saved).toMatchObject({ id: 'screenshot-id', symbol: 'RARE/USDT', direction: 'SHORT' })
  })

  it('returns the existing row on a stable-ID retry and surfaces rejected inserts', async () => {
    supabaseMock.client.from
      .mockReturnValueOnce(query({ error: { code: '23505', message: 'duplicate key' } }))
      .mockReturnValueOnce(query({ data: savedTradeRow, error: null }))
    await expect(insertTrade(draft, 'screenshot-id')).resolves.toMatchObject({ id: 'screenshot-id' })

    supabaseMock.client.from.mockReturnValueOnce(query({ error: { code: '42501', message: 'row-level security policy denied' } }))
    await expect(insertTrade(draft, 'different-screenshot')).rejects.toThrow('Supabase trade insert failed (42501): row-level security policy denied')
  })
})

describe('trade event parent relationship', () => {
  it.each(['OPEN', 'CLOSE', 'PNL', 'POSITION_DETAILS'] as const)('writes the parent ID on a %s event', eventType => {
    const tradeId = 'trade-created-or-resolved-by-db'
    expect(mapTradeEventInsert({
      tradeId, eventType, screenshotId: 'screenshot-id', rawData: { symbol: 'BTC/USDT' },
    }, 'user-id')).toMatchObject({
      user_id: 'user-id', trade_id: tradeId, event_type: eventType, screenshot_id: 'screenshot-id',
    })
  })

  it('preserves separate parent IDs for repeated symbols', () => {
    const first = mapTradeEventInsert({ tradeId: 'btc-trade-a', eventType: 'CLOSE', rawData: { symbol: 'BTC/USDT' } }, 'user-id')
    const second = mapTradeEventInsert({ tradeId: 'btc-trade-b', eventType: 'OPEN', rawData: { symbol: 'BTC/USDT' } }, 'user-id')
    expect(first.trade_id).not.toBe(second.trade_id)
  })

  it.each([null, undefined, ''])('rejects a missing parent ID before Supabase access (%s)', async tradeId => {
    expect(() => requireTradeEventId(tradeId)).toThrow('parent trade has not been created or matched')
    await expect(recordTradeEvent({
      tradeId: tradeId as string, eventType: 'PNL', rawData: {},
    })).rejects.toThrow('parent trade has not been created or matched')
  })
})
