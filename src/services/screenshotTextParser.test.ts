import { describe, expect, it } from 'vitest'
import { normalizeExtractedText } from './screenshotTextParser'

/**
 * OCR Parsing Tests for CoinDCX USDT Futures Screenshots
 * 
 * These tests validate that the parser correctly handles:
 * 1. Open transaction details (with INR and USDT amounts)
 * 2. Closed transaction details (with entry/exit prices)
 * 3. Rocket-style profit summary cards (with leverage and profit %)
 * 
 * Test data is based on detailed textual representations provided in requirements.
 */

describe('OCR Parsing - COINDCX FUTURES SCREENSHOTS', () => {
  
  describe('TEST CASE 1: OPEN TRADE TRANSACTION', () => {
    /**
     * Open transaction should extract:
     * - Market symbol: SIREN/USDT
     * - Transaction event: OPEN
     * - Asset: USDT
     * - Net PNL: -0.017 USDT (and -1.67 INR as alternate)
     * - Gross PNL: 0.000 USDT
     * - Fees: 0.017 USDT
     * - Direction: NOT present (should be null)
     * - Entry price: NOT present (should be null)
     * - Leverage: NOT present (should be null)
     * - Position size: NOT present (should be null)
     * - Margin: NOT present (should be null)
     */
    it('extracts OPEN transaction with USDT and INR net PNL', () => {
      const ocrText = `Futures History
Screen: Futures History
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

Created At: 17/10/2026 04:21:36 PM

This transaction created a fresh futures position or added to an existing futures position.`

      const result = normalizeExtractedText(ocrText, 0.95)

      // Screenshot classification
      expect(result.screenshotType).toBe('OPEN_TRANSACTION')

      // Market and symbol
      expect(result.symbol).toBe('SIREN/USDT')
      expect(result.quoteCurrency).toBe('USDT')

      // PNL amounts in USDT
      expect(result.pnlAmount).toBe(-0.017)
      expect(result.grossPnlAmount).toBe(0.0)
      expect(result.feeAmount).toBe(0.017)

      // Currency information
      expect(result.fieldCurrencies?.pnlAmount).toBe('USDT')
      expect(result.fieldCurrencies?.grossPnlAmount).toBe('USDT')
      expect(result.fieldCurrencies?.feeAmount).toBe('USDT')

      // Currency audit should track INR alternate
      if (result.currencyAudit?.pnlAmount) {
        expect(result.currencyAudit.pnlAmount.alternateValues).toContainEqual(
          expect.objectContaining({ value: -1.67, currency: 'INR' })
        )
      }

      // Missing fields that should be null (per requirements: unknown values must be null, not 0)
      expect(result.direction).toBeNull()
      expect(result.avgEntry).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
      expect(result.quantity).toBeNull()
      expect(result.closePrice).toBeNull()
    })

    it('preserves rounding differences in OPEN transaction', () => {
      const ocrText = `Market: SIREN • USDT
Transaction type: Open

Net PNL:
-₹1.67
-0.017 USDT

Gross PNL:
₹0.00
0.000 USDT

Fees:
₹1.67
0.017 USDT`

      const result = normalizeExtractedText(ocrText, 0.9)

      // Display values should be preserved as-is, not forced to reconcile
      expect(result.pnlAmount).toBe(-0.017)
      expect(result.feeAmount).toBe(0.017)
      expect(result.grossPnlAmount).toBe(0.0)
    })
  })

  describe('TEST CASE 2: CLOSED TRADE TRANSACTION', () => {
    /**
     * Closed transaction should extract:
     * - Market symbol: SIREN/USDT
     * - Transaction event: CLOSE
     * - Net PNL: 78.734 USDT (and 7917.53 INR as alternate)
     * - Gross PNL: 78.942 USDT (and 7938.39 INR as alternate)
     * - Fees: 0.208 USDT (and 20.87 INR as alternate)
     * - Entry price: 0.03739
     * - Exit price: 0.03054
     * - Asset: USDT
     * - Direction: NOT present (should be null)
     * - Leverage: NOT present (should be null)
     * - Position size: NOT present (should be null)
     * - Margin: NOT present (should be null)
     */
    it('extracts CLOSED transaction with entry and exit prices', () => {
      const ocrText = `Futures History
Transaction Details

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

Created At: 17/10/2026 04:25:42 PM

This transaction either closed or reduced an existing futures position.`

      const result = normalizeExtractedText(ocrText, 0.95)

      // Screenshot classification
      expect(result.screenshotType).toBe('CLOSE_TRANSACTION')

      // Market
      expect(result.symbol).toBe('SIREN/USDT')

      // PNL amounts in USDT
      expect(result.pnlAmount).toBe(78.734)
      expect(result.grossPnlAmount).toBe(78.942)
      expect(result.feeAmount).toBe(0.208)

      // Entry and close prices
      expect(result.avgEntry).toBe(0.03739)
      expect(result.closePrice).toBe(0.03054)

      // Missing fields
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
      expect(result.quantity).toBeNull()

      // Arithmetic preservation
      // 78.942 - 0.208 = 78.734 ✓
      expect(result.grossPnlAmount! - result.feeAmount!).toBeCloseTo(result.pnlAmount!, 3)
    })

    it('handles thousands separators in CLOSED transaction amounts', () => {
      const ocrText = `Market: SIREN • USDT
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
Close price: 0.03054`

      const result = normalizeExtractedText(ocrText, 0.9)

      // Thousands separator should be removed correctly
      expect(result.pnlAmount).toBe(78.734)
      expect(result.grossPnlAmount).toBe(78.942)
      expect(result.feeAmount).toBe(0.208)
      expect(result.avgEntry).toBe(0.03739)
      expect(result.closePrice).toBe(0.03054)
    })
  })

  describe('TEST CASE 3: ROCKET-STYLE PROFIT SUMMARY CARD', () => {
    /**
     * Rocket card should extract:
     * - Market symbol: SIREN/USDT
     * - Exchange: CoinDCX
     * - Position direction: SHORT
     * - Leverage: 7x (as number 7)
     * - Entry price: 0.037
     * - Exit price: 0.031
     * - Profit percentage: 128.0% (from "Profit: 128.0%")
     * - Transaction event: Should be classified as ROCKET_TRADE or similar
     * - Net PNL: NOT shown (should be null)
     * - Margin: NOT shown (should be null)
     * - Position size: NOT shown (should be null)
     */
    it('extracts ROCKET card with direction, leverage, and profit %', () => {
      const ocrText = `Exchange: CoinDCX

Market: SIREN • USDT

Direction: Short

Leverage: 7x

Profit: 128.0%

Entry Price: 0.037

Close price: 0.031

Additional content:
#TradeAndWin10L

Trade Futures on CoinDCX App`

      const result = normalizeExtractedText(ocrText, 0.92)

      // Screenshot type
      expect(result.screenshotType).toBe('ROCKET_TRADE')

      // Exchange and market
      expect(result.exchange).toBe('CoinDCX')
      expect(result.symbol).toBe('SIREN/USDT')

      // Direction and leverage
      expect(result.direction).toBe('SHORT')
      expect(result.leverage).toBe(7)

      // Prices (for ROCKET_TRADE, closePrice goes to referenceClosePrice)
      expect(result.avgEntry).toBe(0.037)
      expect(result.referenceClosePrice).toBe(0.031)

      // Profit percentage - EXPLICITLY DISPLAYED, should be preserved
      expect(result.pnlPercentage).toBe(128.0)

      // NOT displayed in rocket card (these labels don't appear in the OCR text)
      // Per requirements: missing fields must be null, not undefined or 0
      expect(result.pnlAmount).toBeNull()
      expect(result.grossPnlAmount).toBeNull()
      expect(result.feeAmount).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
      expect(result.quantity).toBeNull()
      expect(result.closePrice).toBeNull()  // Not applicable for ROCKET_TRADE (goes to referenceClosePrice)
    })

    it('classifies as ROCKET_TRADE when profit percentage is present', () => {
      const ocrText = `Market: SIREN • USDT
Direction: Short
Leverage: 7x
Profit: 128.0%
Entry Price: 0.037
Close price: 0.031`

      const result = normalizeExtractedText(ocrText, 0.9)

      expect(result.screenshotType).toBe('ROCKET_TRADE')
      expect(result.pnlPercentage).toBe(128.0)
    })

    it('does NOT infer direction from price movement alone', () => {
      // This is a critical test: DIRECTION MUST BE EXTRACTED EXPLICITLY
      // Do not infer it from price changes
      
      // WRONG: Just because 0.037 > 0.031, don't assume SHORT
      // RIGHT: Only if "Short" or "SHORT" is explicitly present
      
      const ocrTextWithoutDirection = `Market: SIREN • USDT
Leverage: 7x
Profit: 128.0%
Entry Price: 0.037
Close price: 0.031`

      const result = normalizeExtractedText(ocrTextWithoutDirection, 0.9)

      // Direction should be null because it's not explicitly stated
      expect(result.direction).toBeNull()
    })
  })

  describe('ROBUST NUMERIC EXTRACTION', () => {
    it('handles negative values correctly', () => {
      const ocrText = `Net PNL: -0.017 USDT`
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.pnlAmount).toBe(-0.017)
    })

    it('handles positive values with + prefix', () => {
      const ocrText = `Net PNL: +78.734 USDT`
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.pnlAmount).toBe(78.734)
    })

    it('handles currency symbols (₹ and $)', () => {
      const ocrText = `Fees: ₹1.67`
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.feeAmount).toBe(1.67)
    })

    it('handles decimal prices', () => {
      const ocrText = `Entry Price: 0.03739
Close price: 0.03054`
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.avgEntry).toBe(0.03739)
      expect(result.closePrice).toBe(0.03054)
    })

    it('handles leverage notation (7x)', () => {
      const ocrText = `Leverage: 7x`
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.leverage).toBe(7)
    })

    it('handles profit percentages with % symbol', () => {
      const ocrText = `Profit: 128.0%`
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.pnlPercentage).toBe(128.0)
    })
  })

  describe('INR AND USDT DISTINCTION', () => {
    it('keeps INR and USDT amounts separate', () => {
      const ocrText = `Net PNL:
+₹7,917.53
+78.734 USDT`

      const result = normalizeExtractedText(ocrText, 0.9)

      // USDT amount should be in pnlAmount
      expect(result.pnlAmount).toBe(78.734)
      expect(result.fieldCurrencies?.pnlAmount).toBe('USDT')

      // INR should be in currencyAudit, not in pnlAmount
      if (result.currencyAudit?.pnlAmount?.alternateValues) {
        const inrValue = result.currencyAudit.pnlAmount.alternateValues.find(v => v.currency === 'INR')
        expect(inrValue?.value).toBe(7917.53)
      }
    })

    it('does NOT mix USDT and INR in the same field', () => {
      const ocrText = `Net PNL:
+₹7,917.53
+78.734 USDT`

      const result = normalizeExtractedText(ocrText, 0.9)

      // The USDT value should NOT somehow become 7917.53
      expect(result.pnlAmount).not.toBe(7917.53)
      expect(result.pnlAmount).toBe(78.734)
    })
  })

  describe('MISSING FIELDS HANDLING', () => {
    it('returns null for genuinely unavailable fields', () => {
      const ocrText = `Market: SIREN • USDT
Transaction type: Open

Net PNL: -0.017 USDT
Gross PNL: 0.000 USDT
Fees: 0.017 USDT`

      const result = normalizeExtractedText(ocrText, 0.9)

      // These fields are NOT present in the OCR text
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.avgEntry).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
      expect(result.quantity).toBeNull()

      // NOT zero, NOT defaults - actually null
      expect(result.margin).not.toBe(0)
      expect(result.leverage).not.toBe(1)
      expect(result.size).not.toBe(0)
    })
  })

  describe('MARKET SYMBOL NORMALIZATION', () => {
    it('normalizes "SIREN • USDT" to "SIREN/USDT"', () => {
      const ocrText = `Market: SIREN • USDT`
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.symbol).toBe('SIREN/USDT')
      expect(result.quoteCurrency).toBe('USDT')
    })

    it('handles different market separators', () => {
      const variants = [
        { text: 'Market: SIREN • USDT', expected: 'SIREN/USDT' },
        { text: 'Market: SIREN - USDT', expected: 'SIREN/USDT' },
        { text: 'Market: SIREN / USDT', expected: 'SIREN/USDT' },
      ]

      for (const variant of variants) {
        const result = normalizeExtractedText(variant.text, 0.9)
        expect(result.symbol).toBe(variant.expected)
      }
    })
  })

  describe('SCREENSHOT CLASSIFICATION', () => {
    it('classifies OPEN transaction correctly', () => {
      const ocrText = 'Transaction type: Open'
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.screenshotType).toBe('OPEN_TRANSACTION')
    })

    it('classifies CLOSE transaction correctly', () => {
      const ocrText = 'Transaction type: Close'
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.screenshotType).toBe('CLOSE_TRANSACTION')
    })

    it('classifies ROCKET_TRADE when profit % is present', () => {
      const ocrText = `Direction: Short
Profit: 128.0%
Entry Price: 0.037`
      const result = normalizeExtractedText(ocrText, 0.9)
      expect(result.screenshotType).toBe('ROCKET_TRADE')
    })
  })

  describe('PRESERVATION OF EXPLICITLY DISPLAYED VALUES', () => {
    it('does NOT overwrite displayed profit percentage with calculated value', () => {
      // Rocket card displays 128.0% profit
      // Even if you calculated it differently, preserve the displayed value
      const ocrText = `Direction: Short
Leverage: 7x
Profit: 128.0%
Entry Price: 0.037
Close price: 0.031`

      const result = normalizeExtractedText(ocrText, 0.9)

      // MUST preserve displayed value
      expect(result.pnlPercentage).toBe(128.0)

      // NOT a recalculated value
      // Example: (0.037 - 0.031) / 0.037 * 100 = 16.22% (WRONG!)
      // The displayed value is what we should use
      expect(result.pnlPercentage).not.toBe(16.22)
    })
  })

  describe('FIELD PROVENANCE AND CURRENCY TRACKING', () => {
    it('tracks which fields were directly extracted from OCR', () => {
      const ocrText = `Market: SIREN • USDT
Direction: Short
Leverage: 7x
Entry Price: 0.037
Close price: 0.031
Profit: 128.0%`

      const result = normalizeExtractedText(ocrText, 0.9)

      // Fields that were directly extracted should be marked
      const expectedFieldsInProvenance = ['symbol', 'direction', 'leverage', 'avgEntry', 'referenceClosePrice', 'pnlPercentage']
      for (const field of expectedFieldsInProvenance) {
        expect(result.fieldProvenance?.[field]?.source).toBe('direct_ocr')
      }
    })

    it('records currency information for monetary fields', () => {
      const ocrText = `Net PNL: +78.734 USDT
Gross PNL: 78.942 USDT
Fees: 0.208 USDT`

      const result = normalizeExtractedText(ocrText, 0.9)

      expect(result.fieldCurrencies?.pnlAmount).toBe('USDT')
      expect(result.fieldCurrencies?.grossPnlAmount).toBe('USDT')
      expect(result.fieldCurrencies?.feeAmount).toBe('USDT')
    })
  })
})
