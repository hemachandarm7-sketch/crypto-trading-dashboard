import { describe, expect, it } from 'vitest'
import { normalizeExtractedText } from './screenshotTextParser'
import { findOpenTradeForClose, findTradeForOpenTransaction, findUniqueOpenTrade } from './tradeMatchingService'
import { determineCloseReason } from './tradeLifecycle'
import type { ExtractedTradeData, Trade } from '../types'

const openScreenshotText = `Futures History USDT Futures
Transaction Details
Market RARE « USDT
Transaction type Open
Net PNL -0.043 USDT
Gross PNL 0.000 USDT
Fees 0.043 USDT
Asset USDT
Order ID 8567564...
Created At 28/09/2026 04:44:05 AM`

const closeScreenshotText = `Futures History USDT Futures
Transaction Details
Market RARE ¢ USDT
Transaction type Close
Net PNL +38.261 USDT
Gross PNL 38.347 USDT
Fees 0.085 USDT
Entry Price 0.02270
Close price 0.01795
Asset USDT
Order ID d1754da...
Created At 30/09/2026 01:50:24 AM`

const positionScreenshotText = [
  'RARE ¢ USDT',
  'Short 10x',
  'Qty (RARE) Size (USDT) Margin (USDT)',
  '8073 136.353 18.379',
  'Avg. Entry LTP Lig. Price',
  '0.02270 0.01689 0.02463',
  'TP : 0.01255 SL : 0.01795',
].join('\n')
const rareShort: Trade = {
  id: 'rare-short', symbol: 'RARE/USDT', exchange: null, marketType: 'Futures', direction: 'SHORT',
  leverage: 10, quantity: 8073, size: 136.353, margin: 18.379, avgEntry: 0.0227, ltp: 0.01689,
  liquidationPrice: 0.02463, takeProfit: 0.01255, stopLoss: 0.01795,
  openTime: new Date(2026, 8, 28, 4, 44, 5).toISOString(), closeTime: null, holdingDurationSeconds: null,
  holdingDurationDisplay: null, closePrice: null, pnlAmount: null, pnlPercentage: null, status: 'OPEN',
  closeReason: null, setup: null, notes: null, exchangePositionId: null, openTransactionId: null,
  closeTransactionId: null, createdAt: '', updatedAt: '',
}

describe('exchange screenshot OCR normalization', () => {
  it.each([
    ['LONG 10x', 'LONG', 10],
    ['SHORT 10x', 'SHORT', 10],
    ['SHORT 20x', 'SHORT', 20],
    ['LONG\n10 x', 'LONG', 10],
    ['SHORT\n10X', 'SHORT', 10],
    ['SHORT\n10 X', 'SHORT', 10],
  ])('extracts leverage from %s', (position, direction, leverage) => {
    expect(normalizeExtractedText(`RARE/USDT\n${position}\nQty 0.015\nSize 1500\nMargin 150`).direction).toBe(direction)
    expect(normalizeExtractedText(`RARE/USDT\n${position}\nQty 0.015\nSize 1500\nMargin 150`).leverage).toBe(leverage)
  })

  it('does not infer leverage from ordinary quantity, size, or margin numbers', () => {
    expect(normalizeExtractedText('RARE/USDT\nSHORT\nQty 0.015\nSize 1500\nMargin 150').leverage).toBeUndefined()
  })

  it('recognizes a RARE open transaction and its India-formatted timestamp without treating its fee as P&L', () => {
    const result = normalizeExtractedText(openScreenshotText)
    expect(result).toMatchObject({ screenshotType: 'OPEN_TRANSACTION', symbol: 'RARE/USDT', transactionId: '8567564' })
    expect(result.eventTime).toBe(new Date(2026, 8, 28, 4, 44, 5).toISOString())
    expect(result.pnlAmount).toBeUndefined()
  })

  it('recognizes the short position details and leaves its unrealized P&L out of realized P&L', () => {
    const result = normalizeExtractedText(positionScreenshotText)
    expect(result).toMatchObject({
      screenshotType: 'POSITION_DETAILS', symbol: 'RARE/USDT', direction: 'SHORT', leverage: 10,
      quantity: 8073, size: 136.353, margin: 18.379, avgEntry: 0.0227, ltp: 0.01689,
      liquidationPrice: 0.02463, takeProfit: 0.01255, stopLoss: 0.01795,
    })
    expect(result.pnlAmount).toBeUndefined()
  })

  it('recognizes the close, net USDT P&L, price, and timestamp', () => {
    const result = normalizeExtractedText(closeScreenshotText)
    expect(result).toMatchObject({
      screenshotType: 'CLOSE_TRANSACTION', symbol: 'RARE/USDT', closePrice: 0.01795,
      avgEntry: 0.0227, pnlAmount: 38.261, transactionId: 'd1754da',
    })
    expect(result.eventTime).toBe(new Date(2026, 8, 30, 1, 50, 24).toISOString())
  })
})

describe('repeated-symbol lifecycle matching', () => {
  it('matches a close screenshot without direction only when there is one active position for that coin', () => {
    const closeData: ExtractedTradeData = { screenshotType: 'CLOSE_TRANSACTION', symbol: 'RARE/USDT', eventTime: new Date(2026, 8, 30).toISOString() }
    expect(findOpenTradeForClose([rareShort], closeData)).toBe(rareShort)
    expect(findOpenTradeForClose([{ ...rareShort, id: 'other', direction: 'LONG' }, rareShort], closeData)).toBeNull()
  })

  it('does not match a closed RARE trade as the current open position', () => {
    expect(findUniqueOpenTrade([{ ...rareShort, status: 'CLOSED' }], {
      screenshotType: 'POSITION_DETAILS', symbol: 'RARE/USDT', direction: 'SHORT',
    })).toBeNull()
  })

  it('attaches a late Open timestamp to a closed position without reopening it', () => {
    const closed = { ...rareShort, status: 'CLOSED' as const, openTime: null, closeTime: new Date(2026, 8, 30, 1, 50, 24).toISOString() }
    const openEvent: ExtractedTradeData = {
      screenshotType: 'OPEN_TRANSACTION', symbol: 'RARE/USDT',
      eventTime: new Date(2026, 8, 28, 4, 44, 5).toISOString(),
    }
    expect(findTradeForOpenTransaction([closed], openEvent)).toBe(closed)
    expect(findTradeForOpenTransaction([closed], {
      ...openEvent, eventTime: new Date(2026, 9, 1, 10, 0).toISOString(),
    })).toBeNull()
  })

  it('identifies the supplied RARE close price as an SL hit for a short trade', () => {
    expect(determineCloseReason('SHORT', 0.01795, 0.01255, 0.01795)).toBe('SL_HIT')
  })
})
