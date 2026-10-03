import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  existingTrades: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<{ draft: Record<string, unknown>; key?: string }>,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  screenshotUpdates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  events: [] as Array<Record<string, unknown>>,
}))

vi.mock('./supabaseClient', () => ({
  ensureSupabaseUser: async () => 'authenticated-user-id',
  requireSupabase: () => ({
    from: (table: string) => {
      let response: { data: unknown; error: null } = { data: [], error: null }
      if (table === 'trades') response = { data: state.existingTrades, error: null }
      if (table === 'screenshots') response = { data: null, error: null }
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'not', 'is', 'order', 'limit']) query[method] = vi.fn(() => query)
      query.single = vi.fn(async () => ({ data: { id: 'screenshot-id', trade_id: null }, error: null }))
      query.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
      query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject)
      return query
    },
  }),
}))

vi.mock('./tradeRepository', () => ({
  updateScreenshot: async (id: string, patch: Record<string, unknown>) => { state.screenshotUpdates.push({ id, patch }) },
  insertTrade: async (draft: Record<string, unknown>, key?: string) => {
    state.inserted.push({ draft, key })
    const created = { id: key ?? 'created-trade', ...draft, createdAt: '', updatedAt: '' }
    state.existingTrades.push(created)
    return created
  },
  mapTrade: (row: unknown) => row,
  updateTradeFromExtraction: async (id: string, patch: Record<string, unknown>) => {
    state.updates.push({ id, patch })
    const existing = state.existingTrades.find(trade => trade.id === id) ?? {}
    return { ...existing, ...patch, id }
  },
  recordTradeEvent: async (event: Record<string, unknown>) => { state.events.push(event) },
  requireTradeEventId: (id: string) => id,
  listTradeEvents: async () => [],
}))

import { applyExtraction } from './screenshotExtractionService'
import type { ExtractedTradeData } from '../types'

const rareTrade = {
  id: 'existing-rare', symbol: 'RARE/USDT', exchange: 'CoinDCX', marketType: 'Futures', direction: 'SHORT',
  leverage: 10, quantity: 8073, size: 136.353, margin: 18.379, avgEntry: 0.0227, ltp: 0.01689,
  liquidationPrice: 0.02463, takeProfit: 0.01255, stopLoss: 0.01795, openTime: '2026-09-28T01:51:31.000Z',
  closeTime: null, holdingDurationSeconds: null, holdingDurationDisplay: null, closePrice: null, pnlAmount: null,
  pnlPercentage: null, status: 'OPEN', closeReason: null, setup: null, notes: null, exchangePositionId: null,
  openTransactionId: 'old-order', closeTransactionId: null, createdAt: '', updatedAt: '',
}

describe('partial screenshot confirmation', () => {
  beforeEach(() => {
    state.existingTrades = []
    state.inserted = []
    state.updates = []
    state.screenshotUpdates = []
    state.events = []
  })

  it('creates an OPEN WLD trade from an unmatched Open transaction with no direction or position fields', async () => {
    const data: ExtractedTradeData = {
      screenshotType: 'OPEN_TRANSACTION', symbol: 'WLD/USDT', eventTime: '2026-09-28T01:51:31.000Z',
      transactionId: '14dfaa2', pnlAmount: -0.025, grossPnlAmount: 0, feeAmount: 0.025,
      fieldCurrencies: { pnlAmount: 'USDT', grossPnlAmount: 'USDT', feeAmount: 'USDT' },
    }
    await expect(applyExtraction('screenshot-id', data)).resolves.toBe('screenshot-id')
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({
      key: 'screenshot-id',
      draft: {
        symbol: 'WLD/USDT', direction: null, leverage: null, status: 'OPEN',
        openTime: '2026-09-28T01:51:31.000Z', openTransactionId: '14dfaa2',
        pnlAmount: -0.025, quantity: null, size: null, margin: null,
        avgEntry: null, ltp: null, liquidationPrice: null, takeProfit: null, stopLoss: null,
        closeTime: null, closePrice: null, pnlPercentage: null,
      },
    })
    expect(state.events).toHaveLength(1)
    expect(state.screenshotUpdates[state.screenshotUpdates.length - 1]?.patch).toMatchObject({ trade_id: 'screenshot-id', extraction_status: 'COMPLETED' })
  })

  it('creates separate rows for repeated-symbol screenshots without strong matching evidence', async () => {
    const base: ExtractedTradeData = { screenshotType: 'OPEN_TRANSACTION', symbol: 'BTC/USDT', direction: 'LONG', leverage: 10 }
    await applyExtraction('btc-first-shot', base)
    await applyExtraction('btc-second-shot', { ...base, leverage: 5 })
    expect(state.inserted).toHaveLength(2)
    expect(state.inserted.map(item => item.key)).toEqual(['btc-first-shot', 'btc-second-shot'])
  })

  it('creates a valid partial position from only symbol, direction, and leverage', async () => {
    await applyExtraction('partial-shot', {
      screenshotType: 'POSITION_DETAILS', symbol: 'BTC/USDT', direction: 'LONG', leverage: 10,
    })
    expect(state.inserted[0]).toMatchObject({
      key: 'partial-shot', draft: {
        symbol: 'BTC/USDT', direction: 'LONG', leverage: 10, status: 'OPEN',
        quantity: null, size: null, margin: null, avgEntry: null, ltp: null,
        liquidationPrice: null, takeProfit: null, stopLoss: null,
      },
    })
  })

  it('creates an unmatched rocket summary as a partial OPEN trade and records PNL evidence', async () => {
    await applyExtraction('rocket-shot', {
      screenshotType: 'ROCKET_TRADE', classificationConfidence: 'VERY_HIGH', symbol: 'WLD/USDT',
      quoteCurrency: 'USDT', direction: 'LONG', leverage: 10, pnlType: 'LOSS', pnlPercentage: -19.63,
      avgEntry: 0.558, referenceClosePrice: 0.547, grossPnlAmount: -2.101, pnlAmount: -2.163,
      fieldCurrencies: { avgEntry: 'USDT', referenceClosePrice: 'USDT', grossPnlAmount: 'USDT', pnlAmount: 'USDT' },
    })
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({
      key: 'rocket-shot', draft: { symbol: 'WLD/USDT', direction: 'LONG', leverage: 10, status: 'OPEN', closeTime: null, closePrice: null, avgEntry: 0.558, pnlPercentage: -19.63 },
    })
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ tradeId: 'rocket-shot', eventType: 'PNL', percentage: -19.63, price: 0.547 })
    expect(state.events[0]).not.toHaveProperty('closePrice')
  })

  it('merges OPEN, rocket summary, and actual CLOSE evidence into one trade', async () => {
    await applyExtraction('open-shot', {
      screenshotType: 'OPEN_TRANSACTION', symbol: 'WLD/USDT', eventTime: '2026-09-28T01:51:31.000Z', transactionId: 'open-order',
    })
    await applyExtraction('rocket-shot', {
      screenshotType: 'ROCKET_TRADE', symbol: 'WLD/USDT', direction: 'LONG', leverage: 10,
      avgEntry: 0.558, referenceClosePrice: 0.547, pnlPercentage: -19.63,
    }, 'open-shot')
    await applyExtraction('actual-close-shot', {
      screenshotType: 'CLOSE_TRANSACTION', symbol: 'WLD/USDT', direction: 'LONG',
      eventTime: '2026-10-01T02:00:00.000Z', closePrice: 0.547, pnlAmount: -2.163,
    }, 'open-shot')
    expect(state.inserted).toHaveLength(1)
    expect(state.updates).toContainEqual(expect.objectContaining({
      id: 'open-shot', patch: expect.objectContaining({ status: 'CLOSED', closePrice: 0.547 }),
    }))
    expect(state.events.map(event => event.eventType)).toEqual(['OPEN', 'PNL', 'CLOSE'])
  })

  it('enriches a strongly matching existing trade with rocket evidence without duplicating it', async () => {
    state.existingTrades = [rareTrade]
    await applyExtraction('rocket-shot', {
      screenshotType: 'ROCKET_TRADE', symbol: 'RARE/USDT', direction: 'SHORT', leverage: 10,
      avgEntry: 0.0227, referenceClosePrice: 0.01795, pnlType: 'PROFIT', pnlPercentage: 208.65,
    })
    expect(state.inserted).toHaveLength(0)
    const update = state.updates.find(item => item.id === 'existing-rare')
    expect(update?.patch).toMatchObject({ pnlPercentage: 208.65 })
    expect(update?.patch).not.toHaveProperty('status')
    expect(state.events).toContainEqual(expect.objectContaining({ tradeId: 'existing-rare', eventType: 'PNL' }))
  })

  it('enriches a confidently matched position from later quantity and entry evidence without inserting another trade', async () => {
    state.existingTrades = [rareTrade]
    await applyExtraction('position-shot', {
      screenshotType: 'POSITION_DETAILS', symbol: 'RARE/USDT', direction: 'SHORT', leverage: 10,
      quantity: 8073, avgEntry: 0.0227, size: 136.353, margin: 18.379, ltp: 0.01689,
      liquidationPrice: 0.02463, takeProfit: 0.01255, stopLoss: 0.01795,
    })
    expect(state.inserted).toHaveLength(0)
    expect(state.updates).toContainEqual(expect.objectContaining({ id: 'existing-rare', patch: expect.objectContaining({ quantity: 8073, liquidationPrice: 0.02463 }) }))
  })

  it('closes a confidently matched trade when a later close screenshot arrives', async () => {
    state.existingTrades = [rareTrade]
    await applyExtraction('close-shot', {
      screenshotType: 'CLOSE_TRANSACTION', symbol: 'RARE/USDT', direction: 'SHORT',
      eventTime: '2026-09-30T01:50:24.000Z', avgEntry: 0.0227, closePrice: 0.01795,
      pnlAmount: 38.261, pnlPercentage: 208.65, transactionId: 'new-close-order',
    })
    expect(state.inserted).toHaveLength(0)
    expect(state.updates).toContainEqual(expect.objectContaining({
      id: 'existing-rare', patch: expect.objectContaining({ status: 'CLOSED', closePrice: 0.01795, closeTime: '2026-09-30T01:50:24.000Z' }),
    }))
  })

  it('creates a closed partial record for an unmatched close transaction', async () => {
    await applyExtraction('close-shot', {
      screenshotType: 'CLOSE_TRANSACTION', symbol: 'WLD/USDT', eventTime: '2026-10-01T02:00:00.000Z',
      transactionId: 'close-order', closePrice: 0.547, pnlAmount: -2.163, pnlPercentage: -19.63,
    })
    expect(state.inserted[0]).toMatchObject({
      key: 'close-shot', draft: { symbol: 'WLD/USDT', direction: null, status: 'CLOSED', closeTime: '2026-10-01T02:00:00.000Z', closePrice: 0.547, pnlAmount: -2.163 },
    })
  })

  it('does not silently match a repeated coin using only direction and leverage', async () => {
    state.existingTrades = [rareTrade]
    await applyExtraction('unmatched-position', {
      screenshotType: 'POSITION_DETAILS', symbol: 'RARE/USDT', direction: 'SHORT', leverage: 10,
    })
    expect(state.inserted).toHaveLength(1)
    expect(state.updates).toHaveLength(0)
  })

  it('creates another open order instead of attaching by symbol, direction, and leverage alone', async () => {
    state.existingTrades = [rareTrade]
    await applyExtraction('second-open-shot', {
      screenshotType: 'OPEN_TRANSACTION', symbol: 'RARE/USDT', direction: 'SHORT', leverage: 10,
    })
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]?.key).toBe('second-open-shot')
    expect(state.updates).toHaveLength(0)
  })
})
