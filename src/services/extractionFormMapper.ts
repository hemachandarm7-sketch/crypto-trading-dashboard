import type { Direction, ExtractedTradeData } from '../types'

export interface ExtractionFormValues {
  symbol: string
  direction: Direction | ''
  eventTime: string
  values: Record<string, string>
}

const numericFields = [
  'transactionPrice', 'closePrice', 'referenceClosePrice', 'leverage', 'quantity', 'size', 'margin', 'avgEntry', 'ltp',
  'liquidationPrice', 'takeProfit', 'stopLoss', 'pnlAmount', 'grossPnlAmount', 'feeAmount', 'entryNotional', 'pnlPercentage',
] as const

function toLocalDateTime(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

/** The sole mapping boundary between OCR's normalized result and editable form state. */
export function mapExtractionToForm(data: Partial<ExtractedTradeData> | null | undefined): ExtractionFormValues {
  const values = Object.fromEntries(numericFields.map(key => {
    const value = data?.[key]
    return [key, typeof value === 'number' && Number.isFinite(value) ? String(value) : '']
  }))
  const mapped: ExtractionFormValues = {
    symbol: data?.symbol ?? '',
    direction: data?.direction ?? '',
    eventTime: toLocalDateTime(data?.eventTime),
    values,
  }
  if (import.meta.env.DEV) console.debug('[FORM] populated data', mapped)
  return mapped
}
