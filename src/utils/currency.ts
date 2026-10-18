export type CurrencyCode = 'INR' | 'USD' | 'USDT'

export const monetaryFields = [
  'size', 'margin', 'transactionPrice', 'closePrice', 'referenceClosePrice', 'avgEntry', 'ltp',
  'closeNotional', 'liquidationPrice', 'takeProfit', 'stopLoss', 'pnlAmount',
  'grossPnlAmount', 'feeAmount', 'entryNotional',
] as const

export type MonetaryField = typeof monetaryFields[number]
export type CurrencyAudit = Partial<Record<MonetaryField, {
  originalValue: number
  originalCurrency: CurrencyCode
  usdRate: number | null
  rateDate: string | null
  rateSource?: string | null
  convertedAt?: string | null
  alternateValues?: Array<{ value: number; currency: CurrencyCode }>
}>>

export function formatCurrencyUSD(value: number | null | undefined, _sourceCurrency?: string): string {
  void _sourceCurrency
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

export function detectCurrency(text: string): CurrencyCode | null {
  if (/[₹]|\bINR\b|\bRs\.?\s*\d|Indian\s+Rupee/i.test(text)) return 'INR'
  if (/\bUSDT\b/i.test(text)) return 'USDT'
  if (/\bUSD\b|\$/.test(text)) return 'USD'
  return null
}
