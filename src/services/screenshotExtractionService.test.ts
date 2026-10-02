import { describe, expect, it, vi } from 'vitest'
import { normalizeExtractedText } from './screenshotTextParser'
import { extractScreenshot, findMarginValueCrop, normalizeScreenshotCurrencies } from './screenshotExtractionService'
import { getInrToUsdRate } from './exchangeRateService'
import { findOpenTradeForClose, findOpenTradeForPositionDetails, findTradeForOpenTransaction, findUniqueOpenTrade } from './tradeMatchingService'
import { determineCloseReason } from './tradeLifecycle'
import type { ExtractedTradeData, Trade } from '../types'

vi.mock('./exchangeRateService', () => ({ getInrToUsdRate: vi.fn(async () => ({ rate: 0.01136, date: '2026-10-02' })) }))

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
const actualPositionScreenshotOcr = `[ J
INR Futures USDT Futures Global Futures
RARE « USDT
Short 10x Isolated
Active PNL (INR)
+34,719.49 16.904 USDT +255.20%
Qty (RARE) Size (USDT) Margin (USDT)
8073 136.353 18.379
Avg. Entry LTP Liq. Price
0.02270 0.01689 0.02463
TP :0.01255 SL:0.01795`
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
  it('maps a label-guided OCR Margin recovery into the review extraction', async () => {
    const provider = { extractText: async () => ({
      text: 'DEXE/USDT\nLong 7x\nQty (DEXE) Size (USDT) Margin (USDT)\n79.87 157.504 PARK]',
      confidence: 0.8,
      recoveredMargin: 23.433,
    }) }
    const extracted = await extractScreenshot({ name: 'position.png' } as File, provider)

    expect(extracted).toMatchObject({ screenshotType: 'POSITION_DETAILS', symbol: 'DEXE/USDT', direction: 'LONG', leverage: 7, margin: 23.433 })
  })

  it('uses the recognized Margin label to target a missed numeric value cell', () => {
    const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 })
    const crop = findMarginValueCrop([{
      paragraphs: [{ lines: [
        { text: 'Qty (DEXE) Size (USDT) Margin (USDT)', bbox: box(59, 584, 1019, 613), words: [
          { text: 'Qty', bbox: box(59, 586, 105, 613) },
          { text: 'Size', bbox: box(435, 586, 489, 607) },
          { text: 'Margin', bbox: box(825, 586, 913, 613) },
        ] },
        { text: '79.87 157.504 PARK]', bbox: box(59, 639, 1020, 664), words: [] },
        { text: 'Avg. Entry LTP Liq. Price', bbox: box(59, 708, 1021, 741), words: [] },
      ] }],
    }], 1080, 1083)

    expect(crop).toEqual({ left: 807, top: 633, width: 213, height: 37 })
  })

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

  it('extracts the real supplied RARE/USDT screenshot fields without shifting Margin into Liq. Price', () => {
    const result = normalizeExtractedText(actualPositionScreenshotOcr)
    expect(result).toMatchObject({
      screenshotType: 'POSITION_DETAILS', symbol: 'RARE/USDT', direction: 'SHORT', leverage: 10,
      quantity: 8073, size: 136.353, margin: 18.379, avgEntry: 0.0227, ltp: 0.01689,
      liquidationPrice: 0.02463, takeProfit: 0.01255, stopLoss: 0.01795,
    })
    expect(result.fieldCurrencies).toMatchObject({ size: 'USDT', margin: 'USDT', liquidationPrice: 'USDT' })
  })

  it.each([
    ['Margin: 25.00 USDT\nLiq. Price: 98500.00 USDT', 25, 98500],
    ['Margin: 100 USDT\nLiquidation Price: 105000 USDT', 100, 105000],
  ])('keeps labeled Margin separate from Liquidation Price (%s)', (labels, expectedMargin, expectedLiquidation) => {
    const parsed = normalizeExtractedText(`RARE/USDT\nShort 10x\n${labels}`)
    expect(parsed.margin).toBe(expectedMargin)
    expect(parsed.liquidationPrice).toBe(expectedLiquidation)
    expect(parsed.leverage).toBe(10)
    expect(parsed.fieldCurrencies?.margin).toBe('USDT')
    expect(parsed.fieldCurrencies?.liquidationPrice).toBe('USDT')
  })

  it('does not borrow the liquidation-price column when the Margin row is incomplete', () => {
    const parsed = normalizeExtractedText([
      'RARE/USDT', 'SHORT 10x', 'Qty (RARE) Size (USDT) Margin (USDT)', '8073 136.353',
      'Avg. Entry LTP Liq. Price', '0.02270 0.01689 0.02463', 'TP : 0.01255 SL : 0.01795',
    ].join('\n'))
    expect(parsed.quantity).toBe(8073)
    expect(parsed.size).toBe(136.353)
    expect(parsed.margin).toBeUndefined()
    expect(parsed.liquidationPrice).toBe(0.02463)
  })

  it.each([
    [
      'Qty (RARE)\nSize (USDT)\nMargin (USDT)\n8073\n136.353\n18.379\nAvg. Entry\nLTP\nLiq. Price\n0.02270\n0.01689\n0.02463',
      8073, 136.353, 18.379, 0.02463,
    ],
    [
      'Qty (RARE) Size (USDT) Margin (USDT)\n8073\n136.353\n18.379\nAvg. Entry LTP Liq. Price\n0.02270 0.01689 0.02463',
      8073, 136.353, 18.379, 0.02463,
    ],
  ])('keeps Margin populated when OCR splits header/value rows (%s)', (grid, quantity, size, margin, liquidationPrice) => {
    const parsed = normalizeExtractedText(`RARE/USDT\nSHORT 10x\n${grid}`)
    expect(parsed).toMatchObject({ quantity, size, margin, liquidationPrice })
  })

  it('recognizes the close, net USDT P&L, price, and timestamp', () => {
    const result = normalizeExtractedText(closeScreenshotText)
    expect(result).toMatchObject({
      screenshotType: 'CLOSE_TRANSACTION', symbol: 'RARE/USDT', closePrice: 0.01795,
      avgEntry: 0.0227, pnlAmount: 38.261, transactionId: 'd1754da',
    })
    expect(result.eventTime).toBe(new Date(2026, 8, 30, 1, 50, 24).toISOString())
  })

  it('extracts INR net P&L without mistaking it for an absent amount', () => {
    const parsed = normalizeExtractedText('Transaction type Close\nMarket ABC / USD\nNet PNL -₹1,250.50 INR\nCreated At 02/10/2026 10:00 AM')
    expect(parsed.pnlAmount).toBe(-1250.5)
    expect(parsed.fieldCurrencies?.pnlAmount).toBe('INR')
  })

  it('keeps USDT position monetary fields normalized as USD 1:1', async () => {
    const parsed = normalizeExtractedText(positionScreenshotText)
    vi.mocked(getInrToUsdRate).mockClear()
    expect(parsed.fieldCurrencies).toMatchObject({ size: 'USDT', margin: 'USDT', avgEntry: 'USDT', takeProfit: 'USDT', stopLoss: 'USDT' })
    const result = await normalizeScreenshotCurrencies(parsed)
    expect(result.size).toBe(136.353)
    expect(result.currencyAudit?.size).toMatchObject({ originalValue: 136.353, originalCurrency: 'USDT', usdRate: 1 })
    expect(result.margin).toBe(18.379)
    expect(result.liquidationPrice).toBe(0.02463)
    expect(result.currencyAudit?.margin).toMatchObject({ originalValue: 18.379, originalCurrency: 'USDT', usdRate: 1 })
    expect(getInrToUsdRate).not.toHaveBeenCalled()
  })

  it('converts INR monetary values using the event-date rate and retains original audit values', async () => {
    const result = await normalizeScreenshotCurrencies({
      screenshotType: 'PNL', eventTime: '2026-10-02T05:00:00.000Z', pnlAmount: 1000,
      fieldCurrencies: { pnlAmount: 'INR' },
    })
    expect(result.pnlAmount).toBeCloseTo(11.36)
    expect(result.currencyAudit?.pnlAmount).toMatchObject({ originalValue: 1000, originalCurrency: 'INR', usdRate: 0.01136, rateDate: '2026-10-02', rateSource: 'Frankfurter API' })
    expect(result.currencyAudit?.pnlAmount?.convertedAt).toBeTruthy()
  })

  it('parses and converts an explicitly rupee-denominated margin', async () => {
    const parsed = normalizeExtractedText('RARE/USDT\nMargin: ₹8,500')
    expect(parsed.margin).toBe(8500)
    expect(parsed.fieldCurrencies?.margin).toBe('INR')
    vi.mocked(getInrToUsdRate).mockClear()
    const converted = await normalizeScreenshotCurrencies(parsed)
    expect(getInrToUsdRate).toHaveBeenCalledOnce()
    expect(converted.margin).toBeCloseTo(96.56)
    expect(converted.currencyAudit?.margin).toMatchObject({ originalValue: 8500, originalCurrency: 'INR', usdRate: 0.01136, rateSource: 'Frankfurter API' })
  })

  it('recognizes Rs. as an explicit INR marker', () => {
    const parsed = normalizeExtractedText('Margin: Rs. 8,500')
    expect(parsed.margin).toBe(8500)
    expect(parsed.fieldCurrencies?.margin).toBe('INR')
  })

  it('does not convert USDT based on an INR value elsewhere in unrelated raw text', async () => {
    const parsed = normalizeExtractedText('RARE/USDT\nMargin: 100 USDT\nNet PNL: ₹850')
    expect(parsed.margin).toBe(100)
    expect(parsed.fieldCurrencies?.margin).toBe('USDT')
    vi.mocked(getInrToUsdRate).mockClear()
    const result = await normalizeScreenshotCurrencies(parsed)
    expect(result.margin).toBe(100)
    expect(result.currencyAudit?.margin).toMatchObject({ originalValue: 100, originalCurrency: 'USDT', usdRate: 1 })
    expect(getInrToUsdRate).toHaveBeenCalledOnce() // Only the explicitly rupee-denominated P&L is converted.
  })

  it('leaves a monetary amount with no currency evidence unconverted', async () => {
    vi.mocked(getInrToUsdRate).mockClear()
    const result = await normalizeScreenshotCurrencies({ screenshotType: 'POSITION_DETAILS', margin: 25 })
    expect(result.margin).toBe(25)
    expect(result.currencyAudit?.margin).toBeUndefined()
    expect(getInrToUsdRate).not.toHaveBeenCalled()
  })

  it('does not change explicitly USD monetary values', async () => {
    const result = await normalizeScreenshotCurrencies({ screenshotType: 'PNL', pnlAmount: 100, fieldCurrencies: { pnlAmount: 'USD' } })
    expect(result.pnlAmount).toBe(100)
    expect(result.currencyAudit?.pnlAmount?.usdRate).toBe(1)
  })

  it('keeps a confirmed conversion stable and does not convert it a second time', async () => {
    const once = await normalizeScreenshotCurrencies({ screenshotType: 'PNL', pnlAmount: 1000, fieldCurrencies: { pnlAmount: 'INR' } })
    vi.mocked(getInrToUsdRate).mockClear()
    const twice = await normalizeScreenshotCurrencies(once)
    expect(once.pnlAmount).toBeCloseTo(11.36)
    expect(twice.pnlAmount).toBe(once.pnlAmount)
    expect(twice.currencyAudit).toEqual(once.currencyAudit)
    expect(getInrToUsdRate).not.toHaveBeenCalled()
  })

  it('allows confirmation to continue with missing normalized amount if the rate service fails', async () => {
    vi.mocked(getInrToUsdRate).mockRejectedValueOnce(new Error('offline'))
    const result = await normalizeScreenshotCurrencies({ screenshotType: 'PNL', pnlAmount: 1000, fieldCurrencies: { pnlAmount: 'INR' } })
    expect(result.pnlAmount).toBeNull()
    expect(result.currencyAudit?.pnlAmount).toMatchObject({ originalValue: 1000, originalCurrency: 'INR', usdRate: null, rateDate: null, rateSource: 'Frankfurter API', convertedAt: null })
  })
})

describe('repeated-symbol lifecycle matching', () => {
  it('reuses the existing open trade when a position-details screenshot is confirmed again', () => {
    const position: ExtractedTradeData = {
      screenshotType: 'POSITION_DETAILS', symbol: 'RARE/USDT', direction: 'SHORT', leverage: 10,
      quantity: 8073, avgEntry: 0.0227,
    }
    expect(findOpenTradeForPositionDetails([rareShort], position)).toBe(rareShort)
  })

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
