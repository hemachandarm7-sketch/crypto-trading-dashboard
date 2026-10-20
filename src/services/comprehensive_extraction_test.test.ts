import { describe, it, expect } from 'vitest'
import { normalizeExtractedText } from './screenshotTextParser'

describe('COMPREHENSIVE OCR EXTRACTION FOR ALL SCREENSHOT TYPES', () => {
  describe('Test Case 1: OPEN TRANSACTION', () => {
    it('extracts all fields correctly', () => {
      const ocrText = `Screen: Futures History
Section: Transaction Details

Market:
SIREN • USDT

Transaction type:
Open

Net PNL:
-₹1.67
-0.017 USDT

Gross PNL:
₹0.00
0.000 USDT

Fees:
₹1.67
0.017 USDT

Asset:
USDT

Order ID:
3e94125...

Created At:
17/10/2026 04:21:36 PM`

      const result = normalizeExtractedText(ocrText)

      expect(result.screenshotType).toBe('OPEN_TRANSACTION')
      expect(result.symbol).toBe('SIREN/USDT')
      expect(result.pnlAmount).toBe(-0.017)
      expect(result.grossPnlAmount).toBe(0.0)
      expect(result.feeAmount).toBe(0.017)
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.avgEntry).toBeNull()
      expect(result.closePrice).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()

      // Verify INR alternates
      const inrPnl = result.currencyAudit?.pnlAmount?.alternateValues?.find(v => v.currency === 'INR')
      expect(inrPnl?.value).toBe(-1.67)
    })
  })

  describe('Test Case 2: CLOSED TRANSACTION', () => {
    it('extracts all fields correctly', () => {
      const ocrText = `Screen: Futures History
Section: Transaction Details

Market:
SIREN • USDT

Transaction type:
Close

Net PNL:
+₹7,917.53
+78.734 USDT

Gross PNL:
₹7,938.39
78.942 USDT

Fees:
₹20.87
0.208 USDT

Entry Price:
0.03739

Close price:
0.03054

Asset:
USDT

Order ID:
cb1c0e5...

Created At:
17/10/2026 04:25:42 PM`

      const result = normalizeExtractedText(ocrText)

      expect(result.screenshotType).toBe('CLOSE_TRANSACTION')
      expect(result.symbol).toBe('SIREN/USDT')
      expect(result.pnlAmount).toBe(78.734)
      expect(result.grossPnlAmount).toBe(78.942)
      expect(result.feeAmount).toBe(0.208)
      expect(result.avgEntry).toBe(0.03739)
      expect(result.closePrice).toBe(0.03054)
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()

      // Verify INR alternates
      const inrPnl = result.currencyAudit?.pnlAmount?.alternateValues?.find(v => v.currency === 'INR')
      expect(inrPnl?.value).toBe(7917.53)
    })
  })

  describe('Test Case 3: ROCKET-STYLE PROFIT CARD', () => {
    it('extracts all fields correctly', () => {
      const ocrText = `Exchange:
CoinDCX

Market:
SIREN • USDT

Direction:
Short

Leverage:
7x

Profit:
128.0%

Entry Price:
0.037

Close price:
0.031

#TradeAndWin10L

Trade Futures on CoinDCX App`

      const result = normalizeExtractedText(ocrText)

      expect(result.screenshotType).toBe('ROCKET_TRADE')
      expect(result.symbol).toBe('SIREN/USDT')
      expect(result.exchange).toBe('CoinDCX')
      expect(result.direction).toBe('SHORT')
      expect(result.leverage).toBe(7)
      expect(result.pnlPercentage).toBe(128.0)
      expect(result.avgEntry).toBe(0.037)
      expect(result.referenceClosePrice).toBe(0.031)
      expect(result.pnlAmount).toBeNull()
      expect(result.grossPnlAmount).toBeNull()
      expect(result.feeAmount).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
    })
  })

  describe('Test Case 4: LIQUIDATION TRANSACTION', () => {
    it('extracts all fields correctly including liquidation clearance', () => {
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

      expect(result.screenshotType).toBe('LIQUIDATION')
      expect(result.symbol).toBe('RECALL/USDT')
      expect(result.pnlAmount).toBe(-49.337)
      expect(result.grossPnlAmount).toBe(-42.371)
      expect(result.feeAmount).toBe(0.0)
      expect(result.liquidationClearance).toBe(691.42)
      expect(result.direction).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.avgEntry).toBeNull()
      expect(result.closePrice).toBeNull()
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()

      // Verify INR alternates - CRITICAL: Must be -4896.72, NOT -34896.72
      const inrPnl = result.currencyAudit?.pnlAmount?.alternateValues?.find(v => v.currency === 'INR')
      expect(inrPnl?.value).toBe(-4896.72)

      const inrGrossPnl = result.currencyAudit?.grossPnlAmount?.alternateValues?.find(v => v.currency === 'INR')
      expect(inrGrossPnl?.value).toBe(-4205.30)

      // Liquidation clearance should be stored separately with INR currency
      expect(result.liquidationClearance).toBe(691.42)
      // For INR-only fields, the value is in originalValue (not alternateValues)
      expect(result.currencyAudit?.liquidationClearance?.originalValue).toBe(691.42)
      expect(result.currencyAudit?.liquidationClearance?.originalCurrency).toBe('INR')
    })

    it('keeps liquidation clearance separate from fees', () => {
      const ocrText = `Market: RECALL • USDT
Transaction type: Liquidation
Liquidation clearance: ₹691.42
Fees: ₹0.00 0.000 USDT`

      const result = normalizeExtractedText(ocrText)

      expect(result.liquidationClearance).toBe(691.42)
      expect(result.feeAmount).toBe(0.0)
      expect(result.liquidationClearance).not.toBe(result.feeAmount)
    })
  })

  describe('REGRESSION TESTS', () => {
    it('handles negative values correctly across all types', () => {
      const openTx = normalizeExtractedText('Market: TEST/USDT\nTransaction type: Open\nNet PNL: -₹100 -1.0 USDT')
      expect(openTx.pnlAmount).toBe(-1.0)
      expect(openTx.currencyAudit?.pnlAmount?.alternateValues?.[0].value).toBe(-100)

      const closeTx = normalizeExtractedText('Market: TEST/USDT\nTransaction type: Close\nNet PNL: -₹100 -1.0 USDT')
      expect(closeTx.pnlAmount).toBe(-1.0)

      const liquidTx = normalizeExtractedText('Market: TEST/USDT\nTransaction type: Liquidation\nNet PNL: -₹100 -1.0 USDT')
      expect(liquidTx.pnlAmount).toBe(-1.0)
    })

    it('handles thousands separators correctly', () => {
      const result = normalizeExtractedText('Market: TEST/USDT\nTransaction type: Close\nNet PNL: -₹7,917.53 -78.734 USDT')
      expect(result.pnlAmount).toBe(-78.734)
      expect(result.currencyAudit?.pnlAmount?.alternateValues?.[0].value).toBe(-7917.53)
    })

    it('distinguishes zero from missing values', () => {
      const result = normalizeExtractedText('Market: TEST/USDT\nTransaction type: Close\nFees: ₹0.00 0.000 USDT')
      expect(result.feeAmount).toBe(0.0)  // Explicit zero is valid
      expect(result.feeAmount).not.toBeNull()
    })

    it('preserves missing fields as null, not zero', () => {
      const result = normalizeExtractedText('Market: TEST/USDT\nTransaction type: Open\nNet PNL: -0.017 USDT')
      expect(result.size).toBeNull()
      expect(result.margin).toBeNull()
      expect(result.avgEntry).toBeNull()
      expect(result.leverage).toBeNull()
      expect(result.closePrice).toBeNull()
    })

    it('handles reordered OCR text', () => {
      // OCR might detect values in different order than displayed
      const result1 = normalizeExtractedText('Net PNL: -0.017 USDT -₹1.67')
      const result2 = normalizeExtractedText('Net PNL: -₹1.67 -0.017 USDT')
      expect(result1.pnlAmount).toBe(result2.pnlAmount)
      expect(result1.currencyAudit?.pnlAmount?.alternateValues?.[0].value).toBe(result2.currencyAudit?.pnlAmount?.alternateValues?.[0].value)
    })
  })
})
