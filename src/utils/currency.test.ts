import { describe, expect, it } from 'vitest'
import { detectCurrency, formatCurrencyUSD } from './currency'

describe('USD currency display and screenshot currency detection', () => {
  it.each(['₹1,000', 'INR 1000', 'Rs. 1000', 'Indian Rupee 1000'])('recognizes %s as INR', text => {
    expect(detectCurrency(text)).toBe('INR')
  })

  it('distinguishes USD and USDT values', () => {
    expect(detectCurrency('$100')).toBe('USD')
    expect(detectCurrency('38.261 USDT')).toBe('USDT')
    expect(detectCurrency('Net PNL ₹3,848.32 · +38.261 USDT')).toBe('INR')
  })

  it('formats every dashboard amount consistently in USD', () => {
    expect(formatCurrencyUSD(36.67)).toBe('$36.67')
    expect(formatCurrencyUSD(-4.25)).toBe('-$4.25')
    expect(formatCurrencyUSD(0)).toBe('$0.00')
    expect(formatCurrencyUSD(null)).toBe('—')
  })
})
