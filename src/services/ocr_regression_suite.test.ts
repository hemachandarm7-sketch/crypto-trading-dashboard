import { describe, it, expect } from 'vitest'
import { normalizeExtractedText } from './screenshotTextParser'

describe('OCR EXTRACTION REGRESSION TEST SUITE - ALL SCREENSHOT TYPES', () => {
  describe('OPEN TRANSACTION', () => {
    it('extracts all fields from open transaction correctly', () => {
      const ocrText = `Screen: CoinDCX Futures History
Section: Transaction Details

Market: SIREN • USDT
Transaction type: Open

Net PNL:
-₹1.67
-0.017 USDT

Gross PNL:
₹0.00
0.000 USDT

Fees:
₹1.67
0.017 USDT

Asset: USDT
Order ID: 3e94125...
Created At: 17/10/2026 04:21:36 PM`

      const result = normalizeExtractedText(ocrText)

      // Verify screenshot type
      expect(result.screenshotType).toBe('OPEN_TRANSACTION')
      
      // Verify market symbol normalization
      expect(result.symbol).toBe('SIREN/USDT')
      expect(result.quoteCurrency).toBe('USDT')

      // Verify financial values
      expect(result.pnlAmount).toBe(-0.017)
      expect(result.grossPnlAmount).toBe(0.0)
      expect(result.feeAmount).toBe(0.017)

      // Verify INR alternates in currency audit
      if (result.currencyAudit?.pnlAmount) {
        const inrAlt = result.currencyAudit.pnlAmount.alternateValues?.find(v => v.currency === 'INR')
        expect(inrAlt?.value).toBe(-1.67)
      }

      // Verify unavailable fields
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.avgEntry).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
    })
  })

  describe('CLOSED TRANSACTION', () => {
    it('extracts all fields from closed transaction correctly', () => {
      const ocrText = `Screen: CoinDCX Futures History
Section: Transaction Details

Market: SIREN • USDT
Transaction type: Close

Net PNL:
+₹7,917.53
+78.734 USDT

Gross PNL:
₹7,938.39
78.942 USDT

Fees:
₹20.87
0.208 USDT

Entry Price: 0.03739
Close price: 0.03054

Asset: USDT
Order ID: cb1c0e5...
Created At: 17/10/2026 04:25:42 PM`

      const result = normalizeExtractedText(ocrText)

      // Verify screenshot type
      expect(result.screenshotType).toBe('CLOSE_TRANSACTION')

      // Verify market
      expect(result.symbol).toBe('SIREN/USDT')

      // Verify financial values
      expect(result.pnlAmount).toBe(78.734)
      expect(result.grossPnlAmount).toBe(78.942)
      expect(result.feeAmount).toBe(0.208)

      // Verify prices
      expect(result.avgEntry).toBe(0.03739)
      expect(result.closePrice).toBe(0.03054)

      // Verify INR alternates
      if (result.currencyAudit?.pnlAmount) {
        const inrAlt = result.currencyAudit.pnlAmount.alternateValues?.find(v => v.currency === 'INR')
        expect(inrAlt?.value).toBe(7917.53)
      }

      // Verify unavailable fields
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
    })
  })

  describe('ROCKET-STYLE PROFIT CARD', () => {
    it('extracts all fields from rocket card correctly', () => {
      const ocrText = `Exchange: CoinDCX

Market: SIREN • USDT

Direction: Short

Leverage: 7x

Profit: 128.0%

Entry Price: 0.037

Close price: 0.031

#TradeAndWin10L

Trade Futures on CoinDCX App`

      const result = normalizeExtractedText(ocrText)

      // Verify screenshot type
      expect(result.screenshotType).toBe('ROCKET_TRADE')
      expect(result.classificationConfidence).toBe('VERY_HIGH')

      // Verify market and exchange
      expect(result.symbol).toBe('SIREN/USDT')
      expect(result.exchange).toBe('CoinDCX')

      // Verify direction and leverage
      expect(result.direction).toBe('SHORT')
      expect(result.leverage).toBe(7)

      // Verify prices (in avgEntry and referenceClosePrice for ROCKET_TRADE)
      expect(result.avgEntry).toBe(0.037)
      expect(result.referenceClosePrice).toBe(0.031)
      expect(result.closePrice).toBeNull()

      // Verify profit percentage preserved as-is
      expect(result.pnlPercentage).toBe(128.0)

      // Verify unavailable PNL fields
      expect(result.pnlAmount).toBeNull()
      expect(result.grossPnlAmount).toBeNull()
      expect(result.feeAmount).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
    })
  })

  describe('LIQUIDATION TRANSACTION', () => {
    it('extracts all fields from liquidation transaction correctly', () => {
      const ocrText = `Screen: CoinDCX Futures History
Section: Transaction Details

Market:
RECALL • USDT

Transaction type:
Liquidation

Net PNL:
-₹4,896.72
-49.337 USDT

Gross PNL:
-₹4,205.30
-42.371 USDT

Liquidation clearance:
₹691.42

Fees:
₹0.00
0.000 USDT

Asset:
USDT

Order ID:
cf5c772...

Created At:
08/10/2026 08:50:34 PM`

      const result = normalizeExtractedText(ocrText)

      // Verify screenshot type
      expect(result.screenshotType).toBe('LIQUIDATION')

      // Verify market
      expect(result.symbol).toBe('RECALL/USDT')
      expect(result.quoteCurrency).toBe('USDT')

      // Verify financial values - CRITICAL: check correct INR values
      expect(result.pnlAmount).toBe(-49.337)
      expect(result.grossPnlAmount).toBe(-42.371)
      expect(result.feeAmount).toBe(0.0)

      // CRITICAL TEST: Verify INR values are correct, not -34896.72 or -34205.30
      if (result.currencyAudit?.pnlAmount) {
        const inrValue = result.currencyAudit.pnlAmount.alternateValues?.find(v => v.currency === 'INR')
        expect(inrValue?.value).toBe(-4896.72)  // NOT -34896.72
      }

      if (result.currencyAudit?.grossPnlAmount) {
        const inrValue = result.currencyAudit.grossPnlAmount.alternateValues?.find(v => v.currency === 'INR')
        expect(inrValue?.value).toBe(-4205.3)  // NOT -34205.30
      }

      // Verify liquidation clearance is separate from fees
      expect(result.liquidationClearance).toBe(691.42)
      expect(result.feeAmount).toBe(0.0)  // Fees remain zero

      // Verify unavailable fields
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.avgEntry).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
    })
  })

  describe('NUMERIC VALUE HANDLING', () => {
    it('handles thousands separators in currency amounts', () => {
      const ocrText = `Net PNL:
+₹7,917.53
+78.734 USDT`

      const result = normalizeExtractedText(ocrText)
      
      // The thousands separator should be removed
      if (result.currencyAudit?.pnlAmount) {
        const inrValue = result.currencyAudit.pnlAmount.alternateValues?.find(v => v.currency === 'INR')
        expect(inrValue?.value).toBe(7917.53)  // Not 7,917.53
      }
    })

    it('preserves decimal precision', () => {
      const ocrText = `Entry Price: 0.03739
Close price: 0.03054`

      const result = normalizeExtractedText(ocrText)
      
      expect(result.avgEntry).toBe(0.03739)
      expect(result.closePrice).toBe(0.03054)
    })

    it('correctly interprets leverage notation', () => {
      const ocrText = `Leverage: 7x`

      const result = normalizeExtractedText(ocrText)
      
      expect(result.leverage).toBe(7)
    })

    it('correctly interprets profit percentage', () => {
      const ocrText = `Profit: 128.0%`

      const result = normalizeExtractedText(ocrText)
      
      expect(result.pnlPercentage).toBe(128.0)
    })
  })

  describe('SIGN HANDLING', () => {
    it('preserves negative signs in all negative amounts', () => {
      const ocrText = `Net PNL:
-₹4,896.72
-49.337 USDT

Transaction type: Liquidation`

      const result = normalizeExtractedText(ocrText)
      
      expect(result.pnlAmount).toBeLessThan(0)
      expect(result.pnlAmount).toBe(-49.337)

      if (result.currencyAudit?.pnlAmount) {
        const inrValue = result.currencyAudit.pnlAmount.alternateValues?.find(v => v.currency === 'INR')
        expect(inrValue?.value).toBeLessThan(0)
      }
    })

    it('distinguishes between zero and missing fees', () => {
      const ocrText = `Fees:
₹0.00
0.000 USDT`

      const result = normalizeExtractedText(ocrText)
      
      // Zero is valid because it's explicitly displayed
      expect(result.feeAmount).toBe(0)
      expect(result.feeAmount).not.toBeNull()  // NOT null, it's zero
    })
  })

  describe('CURRENCY SEPARATION', () => {
    it('keeps INR and USDT amounts separate in different fields', () => {
      const ocrText = `Net PNL:
+₹7,917.53
+78.734 USDT

Gross PNL:
₹7,938.39
78.942 USDT`

      const result = normalizeExtractedText(ocrText)
      
      // USDT in main field
      expect(result.pnlAmount).toBe(78.734)
      
      // INR in currencyAudit alternates
      if (result.currencyAudit?.pnlAmount) {
        const inrValue = result.currencyAudit.pnlAmount.alternateValues?.find(v => v.currency === 'INR')
        expect(inrValue?.value).toBe(7917.53)
      }

      // They are distinct and not mixed
      expect(result.pnlAmount).not.toBe(7917.53)
    })
  })

  describe('MISSING FIELD HANDLING', () => {
    it('returns null for missing fields, not undefined or zero', () => {
      const ocrText = `Market: RARE/USDT
Transaction type: Open`

      const result = normalizeExtractedText(ocrText)
      
      // Truly missing fields should be null
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.avgEntry).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
      
      // Not undefined, not 0
      expect(result.direction).not.toBeUndefined()
      expect(result.size).not.toBe(0)
    })
  })

  describe('MARKET SYMBOL NORMALIZATION', () => {
    it('normalizes market symbols correctly', () => {
      const testCases = [
        { input: 'SIREN • USDT', expected: 'SIREN/USDT' },
        { input: 'RECALL • USDT', expected: 'RECALL/USDT' },
        { input: 'BTC/USDT', expected: 'BTC/USDT' },
      ]

      for (const { input, expected } of testCases) {
        const ocrText = `Market: ${input}`
        const result = normalizeExtractedText(ocrText)
        expect(result.symbol).toBe(expected)
      }
    })
  })

  describe('SCREENSHOT TYPE CLASSIFICATION', () => {
    it('correctly identifies all four screenshot types', () => {
      const testCases = [
        { text: 'Transaction type: Open', expected: 'OPEN_TRANSACTION' },
        { text: 'Transaction type: Close', expected: 'CLOSE_TRANSACTION' },
        { text: 'Transaction type: Liquidation', expected: 'LIQUIDATION' },
        { text: 'Direction: Short\nLeverage: 7x\nProfit: 128.0%', expected: 'ROCKET_TRADE' },
      ]

      for (const { text, expected } of testCases) {
        const result = normalizeExtractedText(text)
        expect(result.screenshotType).toBe(expected)
      }
    })
  })
})
