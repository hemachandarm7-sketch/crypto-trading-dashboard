import { describe, expect, it } from 'vitest'
import { mapFormToTradeInsert } from './tradeRepository'
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
})
