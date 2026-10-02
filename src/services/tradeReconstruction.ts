import type { ExtractedTradeData, ExtractionFieldProvenance } from '../types'

const sourceRank: Record<ExtractionFieldProvenance['source'], number> = {
  direct_ocr: 3,
  user_corrected: 4,
  calculated: 2,
  estimated: 1,
}

const evidenceFields = [
  'symbol', 'direction', 'transactionPrice', 'closePrice', 'leverage', 'quantity', 'size', 'margin',
  'avgEntry', 'ltp', 'liquidationPrice', 'takeProfit', 'stopLoss', 'pnlAmount', 'grossPnlAmount',
  'feeAmount', 'entryNotional', 'pnlPercentage', 'transactionId', 'positionId', 'exchange', 'marketType', 'marginMode',
] as const

function currencyCompatible(left?: string, right?: string): boolean {
  if (!left || !right || left === right) return true
  return (left === 'USD' || left === 'USDT') && (right === 'USD' || right === 'USDT')
}

/** Merge screenshots already linked to one unique trade, preferring user edits and direct OCR. */
export function mergeTradeEvidence(evidence: Partial<ExtractedTradeData>[]): ExtractedTradeData {
  const latest = evidence[evidence.length - 1] ?? { screenshotType: 'UNKNOWN' as const }
  const result: ExtractedTradeData = { screenshotType: latest.screenshotType ?? 'UNKNOWN' }
  const provenance: NonNullable<ExtractedTradeData['fieldProvenance']> = {}

  for (const field of evidenceFields) {
    for (const item of evidence) {
      const value = item[field]
      if (value == null || value === '') continue
      const candidate = item.fieldProvenance?.[field] ?? { source: 'direct_ocr' as const }
      const current = provenance[field]
      if (!current || sourceRank[candidate.source] >= sourceRank[current.source]) {
        // Same-rank later evidence is useful for current position fields, while
        // lower-ranked calculated values can never replace a direct observation.
        ;(result as unknown as Record<string, unknown>)[field] = value
        provenance[field] = candidate
      }
    }
  }

  const latestEvidence = latest as Partial<ExtractedTradeData>
  result.eventTime = latestEvidence.eventTime ?? null
  result.rawText = evidence.map(item => item.rawText).filter((text): text is string => Boolean(text)).join('\n\n--- screenshot ---\n\n') || undefined
  result.confidence = latestEvidence.confidence ?? null
  result.fieldCurrencies = Object.assign({}, ...evidence.map(item => item.fieldCurrencies ?? {}))
  result.currencyAudit = Object.assign({}, ...evidence.map(item => item.currencyAudit ?? {}))
  result.fieldProvenance = provenance
  return result
}

/** Fill only absent position values; every derived value records its formula and inputs. */
export function reconstructTradeEvidence(data: ExtractedTradeData, calibration?: LiquidationCalibration): ExtractedTradeData {
  const reconstructed: ExtractedTradeData = {
    ...data,
    fieldProvenance: { ...(data.fieldProvenance ?? {}) },
    fieldCurrencies: { ...(data.fieldCurrencies ?? {}) },
  }
  const mark = (field: string, source: 'calculated' | 'estimated', formula: string, inputs: Record<string, number | string | null>, requiresConfirmation = false) => {
    reconstructed.fieldProvenance![field] = { source, formula, inputs, ...(requiresConfirmation ? { requiresConfirmation: true } : {}) }
  }

  if (reconstructed.margin == null && reconstructed.grossPnlAmount != null && reconstructed.pnlPercentage != null && reconstructed.pnlPercentage !== 0) {
    const margin = Math.abs(reconstructed.grossPnlAmount) / Math.abs(reconstructed.pnlPercentage / 100)
    if (Number.isFinite(margin) && margin > 0) {
      reconstructed.margin = margin
      mark('margin', 'calculated', 'abs(grossPnlAmount) / abs(pnlPercentage / 100)', {
        grossPnlAmount: reconstructed.grossPnlAmount, pnlPercentage: reconstructed.pnlPercentage,
      })
      reconstructed.fieldCurrencies!.margin ??= reconstructed.fieldCurrencies?.grossPnlAmount
    }
  }

  const entryPrice = reconstructed.avgEntry ?? reconstructed.transactionPrice
  if (reconstructed.margin != null && reconstructed.leverage != null && reconstructed.leverage > 0) {
    const entryNotional = reconstructed.margin * reconstructed.leverage
    if (Number.isFinite(entryNotional)) {
      if (reconstructed.entryNotional == null) {
        reconstructed.entryNotional = entryNotional
        mark('entryNotional', 'calculated', 'margin * leverage', { margin: reconstructed.margin, leverage: reconstructed.leverage })
        reconstructed.fieldCurrencies!.entryNotional ??= reconstructed.fieldCurrencies?.margin
      }
      const marginCurrency = reconstructed.fieldCurrencies?.margin ?? reconstructed.fieldCurrencies?.grossPnlAmount
      const entryCurrency = reconstructed.fieldCurrencies?.avgEntry ?? reconstructed.fieldCurrencies?.transactionPrice
      if (reconstructed.quantity == null && entryPrice != null && entryPrice > 0 && currencyCompatible(marginCurrency, entryCurrency)) {
        reconstructed.quantity = (reconstructed.entryNotional ?? entryNotional) / entryPrice
        mark('quantity', 'calculated', 'entryNotional / entryPrice', { entryNotional: reconstructed.entryNotional ?? entryNotional, entryPrice })
      }
    }
  }

  const valuationPrice = reconstructed.ltp ?? (reconstructed.screenshotType === 'CLOSE_TRANSACTION' ? reconstructed.closePrice : undefined)
  const sizeCurrency = reconstructed.ltp != null ? reconstructed.fieldCurrencies?.ltp : reconstructed.fieldCurrencies?.closePrice
  if (reconstructed.size == null && reconstructed.quantity != null && valuationPrice != null && currencyCompatible(reconstructed.fieldCurrencies?.entryNotional, sizeCurrency)) {
    reconstructed.size = reconstructed.quantity * valuationPrice
    mark('size', 'calculated', reconstructed.ltp != null ? 'quantity * ltp' : 'quantity * closePrice (closed valuation)', {
      quantity: reconstructed.quantity, valuationPrice,
    })
    reconstructed.fieldCurrencies!.size ??= reconstructed.fieldCurrencies?.ltp ?? reconstructed.fieldCurrencies?.closePrice
  }

  const liquidation = deriveLiquidationPrice(reconstructed, calibration)
  if (liquidation) {
    reconstructed.liquidationPrice = liquidation.value
    reconstructed.fieldProvenance!.liquidationPrice = liquidation.provenance
  }

  return reconstructed
}

export interface LiquidationCalibration {
  exchange: string
  marketType: string
  leverage: number
  marginMode: 'ISOLATED' | 'CROSS'
  maintenanceMarginRate: number
}

/** A reference screenshot may calibrate risk only when product and margin context are explicit. */
export function calibrateMaintenanceMargin(reference: Pick<ExtractedTradeData, 'direction' | 'avgEntry' | 'leverage' | 'exchange' | 'marketType' | 'marginMode' | 'liquidationPrice'>): LiquidationCalibration | null {
  if (!reference.direction || !reference.avgEntry || !reference.leverage || !reference.exchange || !reference.marketType || !reference.marginMode || reference.liquidationPrice == null) return null
  const maintenanceMarginRate = reference.direction === 'LONG'
    ? reference.liquidationPrice / reference.avgEntry - 1 + 1 / reference.leverage
    : 1 + 1 / reference.leverage - reference.liquidationPrice / reference.avgEntry
  if (!Number.isFinite(maintenanceMarginRate) || maintenanceMarginRate < 0 || maintenanceMarginRate >= 1 / reference.leverage) return null
  return {
    exchange: reference.exchange,
    marketType: reference.marketType,
    leverage: reference.leverage,
    marginMode: reference.marginMode,
    maintenanceMarginRate,
  }
}

/** Derive a liquidation price only with matching, explicitly validated product-risk calibration. */
export function deriveLiquidationPrice(
  data: Pick<ExtractedTradeData, 'direction' | 'avgEntry' | 'leverage' | 'exchange' | 'marketType' | 'marginMode' | 'liquidationPrice'>,
  calibration?: LiquidationCalibration,
): { value: number; provenance: ExtractionFieldProvenance } | null {
  if (data.liquidationPrice != null || !data.direction || !data.avgEntry || !data.leverage || !calibration) return null
  if (!data.exchange || !data.marketType || !data.marginMode) return null
  if (calibration.exchange.toLowerCase() !== data.exchange.toLowerCase()
    || calibration.marketType.toLowerCase() !== data.marketType.toLowerCase()
    || calibration.leverage !== data.leverage || calibration.marginMode !== data.marginMode
    || !Number.isFinite(calibration.maintenanceMarginRate)
    || calibration.maintenanceMarginRate < 0 || calibration.maintenanceMarginRate >= 1 / data.leverage) return null
  const factor = data.direction === 'LONG'
    ? 1 - 1 / data.leverage + calibration.maintenanceMarginRate
    : 1 + 1 / data.leverage - calibration.maintenanceMarginRate
  const value = data.avgEntry * factor
  if (!Number.isFinite(value) || value <= 0) return null
  return {
    value,
    provenance: {
      source: 'estimated',
      formula: data.direction === 'LONG' ? 'entry * (1 - 1/leverage + maintenanceMarginRate)' : 'entry * (1 + 1/leverage - maintenanceMarginRate)',
      inputs: { entry: data.avgEntry, leverage: data.leverage, maintenanceMarginRate: calibration.maintenanceMarginRate, exchange: data.exchange, marketType: data.marketType, marginMode: data.marginMode },
      requiresConfirmation: true,
    },
  }
}
