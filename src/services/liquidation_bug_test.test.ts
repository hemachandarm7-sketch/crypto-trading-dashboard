import { describe, it, expect } from 'vitest'
import { normalizeExtractedText } from './screenshotTextParser'

describe('LIQUIDATION TRANSACTION BUG - INR VALUE EXTRACTION', () => {
  it('extracts correct INR values from liquidation transaction', () => {
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

    const result = normalizeExtractedText(ocrText, 0.95)

    console.log('Extracted result:', JSON.stringify(result, null, 2))
    console.log('pnlAmount:', result.pnlAmount)
    console.log('grossPnlAmount:', result.grossPnlAmount)
    console.log('feeAmount:', result.feeAmount)
    console.log('currencyAudit.pnlAmount:', result.currencyAudit?.pnlAmount)
    console.log('currencyAudit.grossPnlAmount:', result.currencyAudit?.grossPnlAmount)
    console.log('currencyAudit.feeAmount:', result.currencyAudit?.feeAmount)

    // Expected: USDT amounts
    expect(result.pnlAmount).toBe(-49.337)
    expect(result.grossPnlAmount).toBe(-42.371)
    expect(result.feeAmount).toBe(0.0)

    // Expected: INR alternate values in currencyAudit
    if (result.currencyAudit?.pnlAmount) {
      console.log('pnlAmount audit:', result.currencyAudit.pnlAmount)
      const inrValue = result.currencyAudit.pnlAmount.alternateValues?.find(v => v.currency === 'INR')
      console.log('INR value for pnlAmount:', inrValue)
      expect(inrValue?.value).toBe(-4896.72)  // NOT -34896.72
    }

    if (result.currencyAudit?.grossPnlAmount) {
      console.log('grossPnlAmount audit:', result.currencyAudit.grossPnlAmount)
      const inrValue = result.currencyAudit.grossPnlAmount.alternateValues?.find(v => v.currency === 'INR')
      console.log('INR value for grossPnlAmount:', inrValue)
      expect(inrValue?.value).toBe(-4205.30)  // NOT -34205.30
    }
  })

  it('extracts liquidationClearance separately from fees', () => {
    const ocrText = `Screen: CoinDCX Futures History
Section: Transaction Details

Market:
RECALL • USDT

Transaction type:
Liquidation

Liquidation clearance:
₹691.42

Fees:
₹0.00
0.000 USDT`

    const result = normalizeExtractedText(ocrText, 0.95)
    
    console.log('liquidationClearance:', result.liquidationClearance)
    console.log('feeAmount:', result.feeAmount)
    
    // Liquidation clearance should be stored separately
    expect(result.liquidationClearance).toBe(691.42)
    // Fees should remain at zero (as displayed)
    expect(result.feeAmount).toBe(0)
  })

  it('preserves negative signs in liquidation losses', () => {
    const ocrText = `Net PNL:
-₹4,896.72
-49.337 USDT

Gross PNL:
-₹4,205.30
-42.371 USDT

Transaction type: Liquidation`

    const result = normalizeExtractedText(ocrText, 0.95)
    
    // All losses should be negative
    expect(result.pnlAmount).toBeLessThan(0)
    expect(result.grossPnlAmount).toBeLessThan(0)
    
    // INR values should also be negative
    if (result.currencyAudit?.pnlAmount) {
      const inrValue = result.currencyAudit.pnlAmount.alternateValues?.find(v => v.currency === 'INR')
      expect(inrValue?.value).toBeLessThan(0)
    }
  })
})
