import type { IpoDraft, IpoStatus, IpoTrade } from '../types/ipo'

/**
 * IPO financial rules (all INR). The governing principle: NEVER assume. An output is `null`
 * unless it follows arithmetically from values the user (or a confirmed screenshot) supplied.
 *
 *  - Application amount  = what was bid for:   quantity × applied price (or the recorded figure).
 *  - Blocked amount      = what the bank held (ASBA / UPI mandate). Recorded separately; it is NOT
 *                          assumed equal to the application amount.
 *  - Funds blocked now   = blocked amount while APPLIED; 0 once allotment is final (the allotted part
 *                          is debited, the rest released).
 *  - Allotted investment = actual money invested, which is NOT the application amount:
 *                          NOT_ALLOTTED → 0;  allotted qty × issue price;  else blocked − refund.
 *                          APPLIED → unknown (null): allotment is never assumed.
 *  - Refund              = recorded figure, else blocked − allotted investment (marked "derived").
 *  - Cost per share      = allotted investment ÷ allotted quantity.
 *  - Unrealized P&L      = held qty × (current price − cost per share), only when LISTED and a price exists.
 *  - Realized P&L        = exit qty × (exit price − cost per share) − exit charges.
 */

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
const known = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value)
/** Rupee-level tolerance for cross-checking independently entered figures. */
const MONEY_TOLERANCE = 1

export type QuantitySource = 'recorded' | 'lots_x_lot_size'
export type ApplicationAmountSource = 'recorded' | 'quantity_x_price'
export type InvestmentSource = 'not_allotted' | 'quantity_x_issue_price' | 'blocked_minus_refund'
export type RefundSource = 'recorded' | 'derived'

export interface IpoFinancials {
  quantity: number | null
  quantitySource: QuantitySource | null
  applicationAmount: number | null
  applicationAmountSource: ApplicationAmountSource | null
  /** Funds the bank is holding right now. `null` when APPLIED but the blocked amount was never recorded. */
  fundsCurrentlyBlocked: number | null
  allottedQuantity: number | null
  allottedInvestment: number | null
  allottedInvestmentSource: InvestmentSource | null
  refund: number | null
  refundSource: RefundSource | null
  costPerShare: number | null
  heldQuantity: number | null
  heldCost: number | null
  listingValue: number | null
  listingGain: number | null
  currentValue: number | null
  priceAsOf: string | null
  realizedPnl: number | null
  realizedPnlPct: number | null
  /** True when realized P&L was computed without any sale charges entered. */
  realizedExcludesCharges: boolean
  unrealizedPnl: number | null
  unrealizedPnlPct: number | null
  totalPnl: number | null
  totalReturnPct: number | null
  /** Cost basis that totalPnl / totalReturnPct are measured against. */
  pnlCostBasis: number
}

type FinancialInput = Pick<IpoDraft,
  'status' | 'lots' | 'lotSize' | 'quantity' | 'appliedPrice' | 'issuePrice' | 'applicationAmount' | 'blockedAmount' |
  'allottedQuantity' | 'refundAmount' | 'listingPrice' | 'currentPrice' | 'currentPriceAt' | 'exitPrice' | 'exitQuantity' | 'exitCharges'>

const ALLOTTED_STATUSES: readonly IpoStatus[] = ['ALLOTTED', 'PARTIALLY_ALLOTTED', 'LISTED']

export function resolveQuantity(ipo: Pick<IpoDraft, 'quantity' | 'lots' | 'lotSize'>): { value: number | null; source: QuantitySource | null } {
  if (known(ipo.quantity) && ipo.quantity > 0) return { value: ipo.quantity, source: 'recorded' }
  if (known(ipo.lots) && known(ipo.lotSize) && ipo.lots > 0 && ipo.lotSize > 0) return { value: ipo.lots * ipo.lotSize, source: 'lots_x_lot_size' }
  return { value: null, source: null }
}

export function computeIpoFinancials(ipo: FinancialInput): IpoFinancials {
  const quantity = resolveQuantity(ipo)

  let applicationAmount: number | null = null
  let applicationAmountSource: ApplicationAmountSource | null = null
  if (known(ipo.applicationAmount)) { applicationAmount = round2(ipo.applicationAmount); applicationAmountSource = 'recorded' }
  else if (quantity.value != null && known(ipo.appliedPrice)) { applicationAmount = round2(quantity.value * ipo.appliedPrice); applicationAmountSource = 'quantity_x_price' }

  const blocked = known(ipo.blockedAmount) ? round2(ipo.blockedAmount) : null
  const fundsCurrentlyBlocked = ipo.status === 'APPLIED' ? blocked : 0

  // Allotted quantity: NOT_ALLOTTED is definitionally 0; APPLIED is unknown; otherwise only what was recorded.
  let allottedQuantity: number | null = null
  if (ipo.status === 'NOT_ALLOTTED') allottedQuantity = 0
  else if (ALLOTTED_STATUSES.includes(ipo.status) && known(ipo.allottedQuantity) && ipo.allottedQuantity > 0) allottedQuantity = ipo.allottedQuantity

  let allottedInvestment: number | null = null
  let allottedInvestmentSource: InvestmentSource | null = null
  if (ipo.status === 'NOT_ALLOTTED') { allottedInvestment = 0; allottedInvestmentSource = 'not_allotted' }
  else if (allottedQuantity != null && allottedQuantity > 0 && known(ipo.issuePrice)) {
    allottedInvestment = round2(allottedQuantity * ipo.issuePrice); allottedInvestmentSource = 'quantity_x_issue_price'
  } else if (ALLOTTED_STATUSES.includes(ipo.status) && blocked != null && known(ipo.refundAmount)) {
    const derived = round2(blocked - ipo.refundAmount)
    if (derived >= 0) { allottedInvestment = derived; allottedInvestmentSource = 'blocked_minus_refund' }
  }

  let refund: number | null = null
  let refundSource: RefundSource | null = null
  if (ipo.status !== 'APPLIED') {
    if (known(ipo.refundAmount)) { refund = round2(ipo.refundAmount); refundSource = 'recorded' }
    else if (blocked != null && allottedInvestment != null && blocked >= allottedInvestment) { refund = round2(blocked - allottedInvestment); refundSource = 'derived' }
  }

  const costPerShare = allottedInvestment != null && allottedQuantity != null && allottedQuantity > 0 ? round2(allottedInvestment / allottedQuantity) : null
  // Use unrounded ratio for downstream P&L so rounding does not compound.
  const exactCostPerShare = allottedInvestment != null && allottedQuantity != null && allottedQuantity > 0 ? allottedInvestment / allottedQuantity : null

  const soldQuantity = known(ipo.exitQuantity) ? ipo.exitQuantity : 0
  const heldQuantity = allottedQuantity != null && allottedQuantity > 0 ? Math.max(0, allottedQuantity - soldQuantity) : null
  const heldCost = heldQuantity != null && exactCostPerShare != null ? round2(heldQuantity * exactCostPerShare) : null

  const listed = ipo.status === 'LISTED'
  const listingValue = listed && allottedQuantity != null && allottedQuantity > 0 && known(ipo.listingPrice) ? round2(allottedQuantity * ipo.listingPrice) : null
  const listingGain = listingValue != null && allottedInvestment != null ? round2(listingValue - allottedInvestment) : null

  const hasPrice = listed && known(ipo.currentPrice) && Boolean(ipo.currentPriceAt)
  const currentValue = hasPrice && heldQuantity != null ? round2(heldQuantity * (ipo.currentPrice as number)) : null
  const unrealizedPnl = hasPrice && heldQuantity != null && heldQuantity > 0 && exactCostPerShare != null
    ? round2(heldQuantity * ((ipo.currentPrice as number) - exactCostPerShare)) : null
  const unrealizedPnlPct = unrealizedPnl != null && heldCost != null && heldCost > 0 ? round2((unrealizedPnl / heldCost) * 100) : null

  let realizedPnl: number | null = null
  let realizedPnlPct: number | null = null
  const canRealize = known(ipo.exitQuantity) && ipo.exitQuantity > 0 && known(ipo.exitPrice) && exactCostPerShare != null
    && allottedQuantity != null && ipo.exitQuantity <= allottedQuantity
  let exitCost = 0
  if (canRealize) {
    const quantitySold = ipo.exitQuantity as number
    exitCost = quantitySold * (exactCostPerShare as number)
    const proceeds = quantitySold * (ipo.exitPrice as number) - (known(ipo.exitCharges) ? ipo.exitCharges : 0)
    realizedPnl = round2(proceeds - exitCost)
    realizedPnlPct = exitCost > 0 ? round2((realizedPnl / exitCost) * 100) : null
  }

  const pnlCostBasis = round2((unrealizedPnl != null && heldCost != null ? heldCost : 0) + (realizedPnl != null ? exitCost : 0))
  const totalPnl = realizedPnl == null && unrealizedPnl == null ? null : round2((realizedPnl ?? 0) + (unrealizedPnl ?? 0))
  const totalReturnPct = totalPnl != null && pnlCostBasis > 0 ? round2((totalPnl / pnlCostBasis) * 100) : null

  return {
    quantity: quantity.value, quantitySource: quantity.source, applicationAmount, applicationAmountSource,
    fundsCurrentlyBlocked, allottedQuantity, allottedInvestment, allottedInvestmentSource, refund, refundSource,
    costPerShare, heldQuantity, heldCost, listingValue, listingGain, currentValue,
    priceAsOf: hasPrice ? ipo.currentPriceAt : null,
    realizedPnl, realizedPnlPct, realizedExcludesCharges: realizedPnl != null && !known(ipo.exitCharges),
    unrealizedPnl, unrealizedPnlPct, totalPnl, totalReturnPct, pnlCostBasis,
  }
}

// ---------------------------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------------------------

const TRANSITIONS: Record<IpoStatus, readonly IpoStatus[]> = {
  APPLIED: ['ALLOTTED', 'PARTIALLY_ALLOTTED', 'NOT_ALLOTTED'],
  ALLOTTED: ['LISTED'],
  PARTIALLY_ALLOTTED: ['LISTED'],
  NOT_ALLOTTED: [],
  LISTED: [],
}

export function allowedNextStatuses(from: IpoStatus): readonly IpoStatus[] { return TRANSITIONS[from] }
export function canTransition(from: IpoStatus, to: IpoStatus): boolean { return from === to || TRANSITIONS[from].includes(to) }

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export interface IpoValidation { errors: string[]; warnings: string[] }
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (value: string | null | undefined): boolean => !value || (ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))

/** Errors block saving. Warnings are shown but never block, because inputs may legitimately be partial. */
export function validateIpoRecord(ipo: IpoDraft): IpoValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!ipo.companyName.trim()) errors.push('Company name is required.')
  for (const [label, value] of [['Open date', ipo.openDate], ['Close date', ipo.closeDate], ['Allotment date', ipo.allotmentDate], ['Listing date', ipo.listingDate], ['Exit date', ipo.exitDate]] as const) {
    if (!validDate(value)) errors.push(`${label} is not a valid date.`)
  }
  for (const [label, value] of [['Price band low', ipo.priceBandLow], ['Price band high', ipo.priceBandHigh], ['Cut-off price', ipo.cutoffPrice], ['Applied price', ipo.appliedPrice], ['Issue price', ipo.issuePrice], ['Listing price', ipo.listingPrice], ['Current price', ipo.currentPrice], ['Exit price', ipo.exitPrice]] as const) {
    if (value != null && !(known(value) && value > 0)) errors.push(`${label} must be greater than zero.`)
  }
  for (const [label, value] of [['Lot size', ipo.lotSize], ['Number of lots', ipo.lots], ['Quantity', ipo.quantity], ['Exit quantity', ipo.exitQuantity]] as const) {
    if (value != null && !(Number.isInteger(value) && value > 0)) errors.push(`${label} must be a whole number greater than zero.`)
  }
  if (ipo.allottedQuantity != null && !(Number.isInteger(ipo.allottedQuantity) && ipo.allottedQuantity >= 0)) errors.push('Allotted shares must be a whole number (0 or more).')
  for (const [label, value] of [['Application amount', ipo.applicationAmount], ['Blocked amount', ipo.blockedAmount], ['Refund amount', ipo.refundAmount], ['Exit charges', ipo.exitCharges]] as const) {
    if (value != null && !(known(value) && value >= 0)) errors.push(`${label} cannot be negative.`)
  }

  if (ipo.openDate && ipo.closeDate && ipo.closeDate < ipo.openDate) errors.push('Close date cannot be before the open date.')
  if (ipo.priceBandLow != null && ipo.priceBandHigh != null && ipo.priceBandHigh < ipo.priceBandLow) errors.push('Price band high cannot be below the low.')
  if (ipo.closeDate && ipo.allotmentDate && ipo.allotmentDate < ipo.closeDate) errors.push('Allotment date cannot be before the issue closes.')
  if (ipo.allotmentDate && ipo.listingDate && ipo.listingDate < ipo.allotmentDate) errors.push('Listing date cannot be before the allotment date.')

  const quantity = resolveQuantity(ipo).value
  const allotted = ipo.allottedQuantity
  switch (ipo.status) {
    case 'APPLIED':
      if (allotted != null && allotted > 0) errors.push('An application still in "Applied" status cannot have allotted shares. Change the status first.')
      if (ipo.listingDate) warnings.push('A listing date is set but the application has no allotment recorded yet.')
      break
    case 'NOT_ALLOTTED':
      if (allotted != null && allotted > 0) errors.push('"Not allotted" cannot have allotted shares.')
      break
    case 'ALLOTTED':
    case 'PARTIALLY_ALLOTTED':
    case 'LISTED':
      if (!(allotted != null && allotted > 0)) errors.push('Enter the number of allotted shares — allotment is never assumed.')
      else if (quantity != null && allotted > quantity) errors.push('Allotted shares cannot exceed the shares applied for.')
      else if (ipo.status === 'PARTIALLY_ALLOTTED' && quantity != null && allotted >= quantity) errors.push('Partially allotted means fewer shares than applied for. Use "Allotted" for a full allotment.')
      else if (ipo.status === 'ALLOTTED' && quantity != null && allotted < quantity) warnings.push('Allotted shares are fewer than applied for — consider "Partially allotted".')
      if (ipo.status === 'LISTED' && !ipo.listingDate) warnings.push('Add the listing date when you know it.')
      break
  }

  if (ipo.currentPrice != null && ipo.status !== 'LISTED') errors.push('A current price can only be recorded after the IPO is listed.')
  if (ipo.currentPrice != null && (!ipo.currentPriceAt || !ipo.currentPriceSource)) errors.push('A current price needs its timestamp and source.')
  if (ipo.exitQuantity != null || ipo.exitPrice != null) {
    if (ipo.status !== 'LISTED') errors.push('Exit details can only be recorded for a listed IPO.')
    if (ipo.exitQuantity == null || ipo.exitPrice == null) errors.push('Enter both exit quantity and exit price.')
    if (ipo.exitQuantity != null && allotted != null && ipo.exitQuantity > allotted) errors.push('Exit quantity cannot exceed allotted shares.')
  }

  if (ipo.appliedPrice != null && ipo.priceBandLow != null && ipo.priceBandHigh != null && (ipo.appliedPrice < ipo.priceBandLow || ipo.appliedPrice > ipo.priceBandHigh)) {
    warnings.push('Applied price is outside the price band.')
  }
  if (ipo.quantity != null && ipo.lots != null && ipo.lotSize != null && ipo.quantity !== ipo.lots * ipo.lotSize) {
    warnings.push(`Quantity (${ipo.quantity}) does not equal lots × lot size (${ipo.lots * ipo.lotSize}).`)
  }
  if (ipo.applicationAmount != null && quantity != null && ipo.appliedPrice != null && Math.abs(ipo.applicationAmount - quantity * ipo.appliedPrice) > MONEY_TOLERANCE) {
    warnings.push('Application amount does not equal quantity × applied price.')
  }
  if (ipo.blockedAmount != null && ipo.applicationAmount != null && ipo.blockedAmount < ipo.applicationAmount - MONEY_TOLERANCE) {
    warnings.push('Blocked amount is lower than the application amount.')
  }
  if (ipo.refundAmount != null && ipo.blockedAmount != null && ipo.refundAmount > ipo.blockedAmount + MONEY_TOLERANCE) {
    errors.push('Refund cannot exceed the blocked amount.')
  }
  if (allotted != null && allotted > 0 && ipo.issuePrice != null && ipo.blockedAmount != null && ipo.refundAmount != null) {
    const byPrice = allotted * ipo.issuePrice
    const byRefund = ipo.blockedAmount - ipo.refundAmount
    if (Math.abs(byPrice - byRefund) > MONEY_TOLERANCE) {
      warnings.push(`Allotted shares × issue price (₹${round2(byPrice)}) does not match blocked − refund (₹${round2(byRefund)}). Check the figures.`)
    }
  }
  return { errors, warnings }
}

// ---------------------------------------------------------------------------------------------
// Timeline estimates (clearly labelled ESTIMATE; never persisted as actual dates)
// ---------------------------------------------------------------------------------------------

function addWorkingDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  let remaining = days
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6) remaining -= 1
  }
  return date.toISOString().slice(0, 10)
}

export interface IpoTimelineEstimate { allotmentDate: string; refundDate: string; listingDate: string; basis: 'ESTIMATE'; note: string }

/**
 * SEBI's T+3 listing cycle counted from the issue close date (T): allotment T+1, refunds/credit T+2,
 * listing T+3 in working days. Exchange holidays are NOT known here, so this is only an estimate;
 * a manually entered or screenshot-confirmed date always takes precedence.
 */
export function estimateIpoTimeline(closeDate: string | null | undefined): IpoTimelineEstimate | null {
  if (!closeDate || !validDate(closeDate)) return null
  return {
    allotmentDate: addWorkingDays(closeDate, 1), refundDate: addWorkingDays(closeDate, 2), listingDate: addWorkingDays(closeDate, 3),
    basis: 'ESTIMATE', note: 'Estimated from the issue close date using the T+3 cycle; exchange holidays are not considered.',
  }
}

export interface IpoUpcomingEvent { ipoId: string; companyName: string; event: 'ALLOTMENT' | 'LISTING'; date: string; basis: 'RECORDED' | 'ESTIMATE' }

export function getUpcomingEvents(ipos: IpoTrade[], today: string): IpoUpcomingEvent[] {
  const events: IpoUpcomingEvent[] = []
  for (const ipo of ipos) {
    const estimate = estimateIpoTimeline(ipo.closeDate)
    if (ipo.status === 'APPLIED') {
      const date = ipo.allotmentDate ?? estimate?.allotmentDate
      if (date && date >= today) events.push({ ipoId: ipo.id, companyName: ipo.companyName, event: 'ALLOTMENT', date, basis: ipo.allotmentDate ? 'RECORDED' : 'ESTIMATE' })
    }
    if (ipo.status === 'APPLIED' || ipo.status === 'ALLOTTED' || ipo.status === 'PARTIALLY_ALLOTTED') {
      const date = ipo.listingDate ?? estimate?.listingDate
      if (date && date >= today && ipo.status !== 'APPLIED') events.push({ ipoId: ipo.id, companyName: ipo.companyName, event: 'LISTING', date, basis: ipo.listingDate ? 'RECORDED' : 'ESTIMATE' })
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.companyName.localeCompare(b.companyName))
}

// ---------------------------------------------------------------------------------------------
// Aggregate analytics — IPO only. Kept separate from crypto analytics.
// ---------------------------------------------------------------------------------------------

export interface IpoAnalytics {
  total: number
  counts: Record<IpoStatus, number>
  /** Share of decided applications (everything not still APPLIED) that received any shares. */
  allotmentRate: number | null
  totalApplicationAmount: number
  fundsBlockedNow: number
  blockedUnknownCount: number
  investedCapital: number
  investedUnknownCount: number
  refundsReceived: number
  heldCost: number
  currentValue: number
  valuedCount: number
  realizedPnl: number
  unrealizedPnl: number
  totalPnl: number
  returnPct: number | null
  pnlCostBasis: number
  incompleteIds: string[]
}

export function getIpoAnalytics(ipos: IpoTrade[]): IpoAnalytics {
  const counts: Record<IpoStatus, number> = { APPLIED: 0, ALLOTTED: 0, PARTIALLY_ALLOTTED: 0, NOT_ALLOTTED: 0, LISTED: 0 }
  let totalApplicationAmount = 0, fundsBlockedNow = 0, blockedUnknownCount = 0, investedCapital = 0, investedUnknownCount = 0
  let refundsReceived = 0, heldCost = 0, currentValue = 0, valuedCount = 0, realizedPnl = 0, unrealizedPnl = 0, pnlCostBasis = 0
  const incomplete = new Set<string>()
  for (const ipo of ipos) {
    counts[ipo.status] += 1
    const f = computeIpoFinancials(ipo)
    if (f.applicationAmount != null) totalApplicationAmount += f.applicationAmount
    if (ipo.status === 'APPLIED') {
      if (f.fundsCurrentlyBlocked == null) { blockedUnknownCount += 1; incomplete.add(ipo.id) } else fundsBlockedNow += f.fundsCurrentlyBlocked
    }
    if (ALLOTTED_STATUSES.includes(ipo.status)) {
      if (f.allottedInvestment == null) { investedUnknownCount += 1; incomplete.add(ipo.id) } else investedCapital += f.allottedInvestment
      if (f.heldCost != null) heldCost += f.heldCost
    }
    if (f.refund != null) refundsReceived += f.refund
    if (f.currentValue != null) { currentValue += f.currentValue; valuedCount += 1 }
    if (f.realizedPnl != null) realizedPnl += f.realizedPnl
    if (f.unrealizedPnl != null) unrealizedPnl += f.unrealizedPnl
    pnlCostBasis += f.pnlCostBasis
    if (ipo.status === 'LISTED' && f.currentValue == null && f.realizedPnl == null) incomplete.add(ipo.id)
  }
  const decided = ipos.length - counts.APPLIED
  const allotted = counts.ALLOTTED + counts.PARTIALLY_ALLOTTED + counts.LISTED
  const totalPnl = round2(realizedPnl + unrealizedPnl)
  return {
    total: ipos.length, counts, allotmentRate: decided > 0 ? round2((allotted / decided) * 100) : null,
    totalApplicationAmount: round2(totalApplicationAmount), fundsBlockedNow: round2(fundsBlockedNow), blockedUnknownCount,
    investedCapital: round2(investedCapital), investedUnknownCount, refundsReceived: round2(refundsReceived), heldCost: round2(heldCost),
    currentValue: round2(currentValue), valuedCount, realizedPnl: round2(realizedPnl), unrealizedPnl: round2(unrealizedPnl), totalPnl,
    returnPct: pnlCostBasis > 0 ? round2((totalPnl / pnlCostBasis) * 100) : null, pnlCostBasis: round2(pnlCostBasis),
    incompleteIds: [...incomplete],
  }
}

// ---------------------------------------------------------------------------------------------
// Combined portfolio (optional): crypto is USD, IPO is INR, so an INR→USD rate is mandatory.
// ---------------------------------------------------------------------------------------------

export interface FxRate { rate: number; date: string }
export interface CombinedPortfolio {
  available: boolean
  reason?: string
  rate: number | null
  rateDate: string | null
  realizedPnlUsd: number | null
  unrealizedIpoPnlUsd: number | null
  /** Margin in open crypto positions + IPO funds blocked + cost of IPO shares still held. */
  capitalCommittedUsd: number | null
  ipoCapitalCommittedInr: number
  capitalIncomplete: boolean
}

/**
 * Capital is counted once per rupee. An IPO rupee is in exactly one bucket at a time:
 * blocked (APPLIED) → invested (allotted cost still held) → released (refund / sold). Refunds and sold
 * cost are therefore excluded, so blocked funds never double-count with the later allotted investment.
 */
export function combinePortfolio(input: { cryptoRealizedPnlUsd: number; cryptoOpenMarginUsd: number; ipo: IpoAnalytics; fx: FxRate | null }): CombinedPortfolio {
  const ipoCapitalCommittedInr = round2(input.ipo.fundsBlockedNow + input.ipo.heldCost)
  const capitalIncomplete = input.ipo.blockedUnknownCount > 0 || input.ipo.investedUnknownCount > 0
  if (!input.fx || !(input.fx.rate > 0)) {
    return { available: false, reason: 'No INR→USD exchange rate is available, so crypto (USD) and IPO (INR) totals cannot be combined.', rate: null, rateDate: null, realizedPnlUsd: null, unrealizedIpoPnlUsd: null, capitalCommittedUsd: null, ipoCapitalCommittedInr, capitalIncomplete }
  }
  const { rate, date } = input.fx
  return {
    available: true, rate, rateDate: date,
    realizedPnlUsd: round2(input.cryptoRealizedPnlUsd + input.ipo.realizedPnl * rate),
    unrealizedIpoPnlUsd: round2(input.ipo.unrealizedPnl * rate),
    capitalCommittedUsd: round2(input.cryptoOpenMarginUsd + ipoCapitalCommittedInr * rate),
    ipoCapitalCommittedInr, capitalIncomplete,
  }
}
