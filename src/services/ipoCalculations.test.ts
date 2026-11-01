import { describe, expect, it } from 'vitest'
import { allowedNextStatuses, canTransition, combinePortfolio, computeIpoFinancials, estimateIpoTimeline, getIpoAnalytics, getUpcomingEvents, resolveQuantity, validateIpoRecord } from './ipoCalculations'
import { emptyIpoDraft, type IpoTrade } from '../types/ipo'

let counter = 0
const ipo = (overrides: Partial<IpoTrade> = {}): IpoTrade => ({
  ...emptyIpoDraft(), id: `ipo-${++counter}`, createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z', companyName: 'Test Co', ...overrides,
})

// The user's real Kotak ASBA confirmation: 182 shares @ ₹82.00 = ₹14,924.00 held.
const kotakApplied = () => ipo({
  companyName: 'Bombay Coated and Special Steels Limited', applicationNumber: '179346627148EFAV', mandateType: 'ASBA',
  quantity: 182, appliedPrice: 82, applicationAmount: 14924, blockedAmount: 14924, status: 'APPLIED',
})

describe('application stage (never assumes allotment)', () => {
  it('computes application and blocked amounts from the Kotak confirmation', () => {
    const f = computeIpoFinancials(kotakApplied())
    expect(f.applicationAmount).toBe(14924)
    expect(f.fundsCurrentlyBlocked).toBe(14924)
    expect(f.allottedInvestment).toBeNull()
    expect(f.allottedQuantity).toBeNull()
    expect(f.refund).toBeNull()
    expect(f.unrealizedPnl).toBeNull()
    expect(f.totalPnl).toBeNull()
  })
  it('derives application amount from quantity × price only when not recorded', () => {
    const f = computeIpoFinancials(ipo({ quantity: 182, appliedPrice: 82, applicationAmount: null }))
    expect(f.applicationAmount).toBe(14924)
    expect(f.applicationAmountSource).toBe('quantity_x_price')
  })
  it('derives quantity from lots × lot size, but prefers a recorded quantity', () => {
    expect(resolveQuantity({ quantity: null, lots: 13, lotSize: 14 })).toEqual({ value: 182, source: 'lots_x_lot_size' })
    expect(resolveQuantity({ quantity: 200, lots: 13, lotSize: 14 })).toEqual({ value: 200, source: 'recorded' })
    expect(resolveQuantity({ quantity: null, lots: 13, lotSize: null })).toEqual({ value: null, source: null })
  })
  it('does not assume blocked equals application amount', () => {
    const f = computeIpoFinancials(ipo({ quantity: 182, appliedPrice: 82, blockedAmount: null }))
    expect(f.applicationAmount).toBe(14924)
    expect(f.fundsCurrentlyBlocked).toBeNull()
  })
  it('returns nothing for an empty record', () => {
    const f = computeIpoFinancials(emptyIpoDraft())
    expect(f.applicationAmount).toBeNull()
    expect(f.quantity).toBeNull()
  })
})

describe('allotment: actual investment differs from application amount', () => {
  it('full allotment at the bid price', () => {
    const f = computeIpoFinancials(ipo({ ...kotakApplied(), status: 'ALLOTTED', allottedQuantity: 182, issuePrice: 82, refundAmount: 0 }))
    expect(f.allottedInvestment).toBe(14924)
    expect(f.allottedInvestmentSource).toBe('quantity_x_issue_price')
    expect(f.costPerShare).toBe(82)
    expect(f.fundsCurrentlyBlocked).toBe(0)
    expect(f.refund).toBe(0)
  })
  it('partial allotment at a lower issue price: investment uses issue price, refund is the remainder', () => {
    const f = computeIpoFinancials(ipo({ ...kotakApplied(), status: 'PARTIALLY_ALLOTTED', allottedQuantity: 91, issuePrice: 80 }))
    expect(f.allottedInvestment).toBe(7280) // 91 × 80, NOT 14,924
    expect(f.refund).toBe(7644) // 14,924 − 7,280
    expect(f.refundSource).toBe('derived')
    expect(f.costPerShare).toBe(80)
  })
  it('a recorded refund is reported as recorded', () => {
    const f = computeIpoFinancials(ipo({ ...kotakApplied(), status: 'PARTIALLY_ALLOTTED', allottedQuantity: 91, issuePrice: 80, refundAmount: 7644 }))
    expect(f.refund).toBe(7644)
    expect(f.refundSource).toBe('recorded')
  })
  it('falls back to blocked − refund when no issue price is known', () => {
    const f = computeIpoFinancials(ipo({ ...kotakApplied(), status: 'PARTIALLY_ALLOTTED', allottedQuantity: 91, refundAmount: 7644, issuePrice: null }))
    expect(f.allottedInvestment).toBe(7280)
    expect(f.allottedInvestmentSource).toBe('blocked_minus_refund')
    expect(f.costPerShare).toBe(80)
  })
  it('leaves investment unknown when neither issue price nor refund is available', () => {
    const f = computeIpoFinancials(ipo({ ...kotakApplied(), status: 'ALLOTTED', allottedQuantity: 91, issuePrice: null, refundAmount: null }))
    expect(f.allottedInvestment).toBeNull()
    expect(f.costPerShare).toBeNull()
    expect(f.refund).toBeNull()
  })
  it('does not treat missing allotted shares as a full allotment', () => {
    const f = computeIpoFinancials(ipo({ ...kotakApplied(), status: 'ALLOTTED', allottedQuantity: null, issuePrice: 82 }))
    expect(f.allottedQuantity).toBeNull()
    expect(f.allottedInvestment).toBeNull()
  })
  it('not allotted: nothing invested, entire blocked amount is released', () => {
    const f = computeIpoFinancials(ipo({ ...kotakApplied(), status: 'NOT_ALLOTTED' }))
    expect(f.allottedQuantity).toBe(0)
    expect(f.allottedInvestment).toBe(0)
    expect(f.refund).toBe(14924)
    expect(f.fundsCurrentlyBlocked).toBe(0)
    expect(f.heldCost).toBeNull()
    expect(f.totalPnl).toBeNull()
  })
})

describe('listing, unrealized and realized P&L', () => {
  const listed = (o: Partial<IpoTrade> = {}) => ipo({
    ...kotakApplied(), status: 'LISTED', allottedQuantity: 182, issuePrice: 82, refundAmount: 0,
    listingDate: '2026-11-05', listingPrice: 95, currentPrice: 100.5, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'MANUAL', ...o,
  })
  it('listing value and gain use the listing price', () => {
    const f = computeIpoFinancials(listed())
    expect(f.listingValue).toBe(17290) // 182 × 95
    expect(f.listingGain).toBe(2366) // 17,290 − 14,924
  })
  it('unrealized P&L and return %', () => {
    const f = computeIpoFinancials(listed())
    expect(f.currentValue).toBe(18291) // 182 × 100.5
    expect(f.unrealizedPnl).toBe(3367) // 182 × 18.5
    expect(f.unrealizedPnlPct).toBe(22.56)
    expect(f.totalPnl).toBe(3367)
    expect(f.priceAsOf).toBe('2026-11-06T10:00:00Z')
  })
  it('shows a loss correctly', () => {
    const f = computeIpoFinancials(listed({ currentPrice: 70 }))
    expect(f.unrealizedPnl).toBe(-2184) // 182 × −12
    expect(f.unrealizedPnlPct).toBe(-14.63)
  })
  it('never reports P&L without a price timestamp (no fabricated live prices)', () => {
    const f = computeIpoFinancials(listed({ currentPriceAt: null }))
    expect(f.currentValue).toBeNull()
    expect(f.unrealizedPnl).toBeNull()
  })
  it('never reports P&L before listing, even if a price is present', () => {
    const f = computeIpoFinancials(listed({ status: 'ALLOTTED' }))
    expect(f.unrealizedPnl).toBeNull()
    expect(f.currentValue).toBeNull()
  })
  it('combines realized (partial exit, charges) and unrealized P&L', () => {
    const f = computeIpoFinancials(ipo({
      status: 'LISTED', quantity: 100, appliedPrice: 100, blockedAmount: 10000, allottedQuantity: 100, issuePrice: 100,
      exitQuantity: 60, exitPrice: 130, exitCharges: 50, currentPrice: 120, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'SCREENSHOT',
    }))
    expect(f.heldQuantity).toBe(40)
    expect(f.realizedPnl).toBe(1750) // 60×130 − 50 − 60×100
    expect(f.realizedPnlPct).toBe(29.17)
    expect(f.unrealizedPnl).toBe(800) // 40 × 20
    expect(f.unrealizedPnlPct).toBe(20)
    expect(f.totalPnl).toBe(2550)
    expect(f.pnlCostBasis).toBe(10000)
    expect(f.totalReturnPct).toBe(25.5)
    expect(f.realizedExcludesCharges).toBe(false)
  })
  it('flags realized P&L that excludes charges when none were entered', () => {
    const f = computeIpoFinancials(ipo({ status: 'LISTED', allottedQuantity: 10, issuePrice: 100, exitQuantity: 10, exitPrice: 110 }))
    expect(f.realizedPnl).toBe(100)
    expect(f.realizedExcludesCharges).toBe(true)
  })
  it('cannot realize when exit exceeds allotment or cost basis is unknown', () => {
    expect(computeIpoFinancials(ipo({ status: 'LISTED', allottedQuantity: 10, issuePrice: 100, exitQuantity: 20, exitPrice: 110 })).realizedPnl).toBeNull()
    expect(computeIpoFinancials(ipo({ status: 'LISTED', allottedQuantity: 10, issuePrice: null, exitQuantity: 5, exitPrice: 110 })).realizedPnl).toBeNull()
  })
  it('a fully sold position has no unrealized exposure', () => {
    const f = computeIpoFinancials(ipo({ status: 'LISTED', allottedQuantity: 10, issuePrice: 100, exitQuantity: 10, exitPrice: 90, currentPrice: 95, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'MANUAL' }))
    expect(f.heldQuantity).toBe(0)
    expect(f.unrealizedPnl).toBeNull()
    expect(f.realizedPnl).toBe(-100)
  })
})

describe('status transitions', () => {
  it('follows Applied → decision → Listed', () => {
    expect(allowedNextStatuses('APPLIED')).toEqual(['ALLOTTED', 'PARTIALLY_ALLOTTED', 'NOT_ALLOTTED'])
    expect(canTransition('APPLIED', 'ALLOTTED')).toBe(true)
    expect(canTransition('ALLOTTED', 'LISTED')).toBe(true)
    expect(canTransition('PARTIALLY_ALLOTTED', 'LISTED')).toBe(true)
  })
  it('rejects impossible jumps', () => {
    expect(canTransition('APPLIED', 'LISTED')).toBe(false)
    expect(canTransition('NOT_ALLOTTED', 'LISTED')).toBe(false)
    expect(canTransition('LISTED', 'APPLIED')).toBe(false)
    expect(canTransition('ALLOTTED', 'NOT_ALLOTTED')).toBe(false)
    expect(allowedNextStatuses('LISTED')).toEqual([])
  })
  it('treats staying in the same status as valid', () => { expect(canTransition('APPLIED', 'APPLIED')).toBe(true) })
})

describe('validation', () => {
  it('accepts the Kotak application', () => { expect(validateIpoRecord(kotakApplied()).errors).toEqual([]) })
  it('requires a company name', () => { expect(validateIpoRecord(emptyIpoDraft()).errors).toContain('Company name is required.') })
  it('requires allotted shares for allotted statuses (no assumed allotment)', () => {
    for (const status of ['ALLOTTED', 'PARTIALLY_ALLOTTED', 'LISTED'] as const) {
      expect(validateIpoRecord(ipo({ ...kotakApplied(), status, allottedQuantity: null })).errors.join(' ')).toMatch(/allotted shares/i)
    }
  })
  it('rejects allotted shares on Applied / Not allotted', () => {
    expect(validateIpoRecord(ipo({ ...kotakApplied(), status: 'APPLIED', allottedQuantity: 10 })).errors.length).toBeGreaterThan(0)
    expect(validateIpoRecord(ipo({ ...kotakApplied(), status: 'NOT_ALLOTTED', allottedQuantity: 10 })).errors.length).toBeGreaterThan(0)
  })
  it('enforces partial < applied and allotted ≤ applied', () => {
    expect(validateIpoRecord(ipo({ ...kotakApplied(), status: 'PARTIALLY_ALLOTTED', allottedQuantity: 182 })).errors.join(' ')).toMatch(/fewer shares/i)
    expect(validateIpoRecord(ipo({ ...kotakApplied(), status: 'ALLOTTED', allottedQuantity: 183 })).errors.join(' ')).toMatch(/cannot exceed/i)
  })
  it('validates date ordering', () => {
    expect(validateIpoRecord(ipo({ companyName: 'X', openDate: '2026-10-30', closeDate: '2026-10-28' })).errors.join(' ')).toMatch(/Close date/)
    expect(validateIpoRecord(ipo({ companyName: 'X', closeDate: '2026-10-30', allotmentDate: '2026-10-29' })).errors.join(' ')).toMatch(/Allotment date/)
    expect(validateIpoRecord(ipo({ companyName: 'X', allotmentDate: '2026-11-03', listingDate: '2026-11-02' })).errors.join(' ')).toMatch(/Listing date/)
    expect(validateIpoRecord(ipo({ companyName: 'X', closeDate: '2026-13-45' })).errors.join(' ')).toMatch(/not a valid date/)
  })
  it('restricts price tracking to listed IPOs and requires a timestamp', () => {
    expect(validateIpoRecord(ipo({ ...kotakApplied(), currentPrice: 90, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'MANUAL' })).errors.join(' ')).toMatch(/after the IPO is listed/)
    const listed = ipo({ ...kotakApplied(), status: 'LISTED', allottedQuantity: 100, currentPrice: 90 })
    expect(validateIpoRecord(listed).errors.join(' ')).toMatch(/timestamp and source/)
  })
  it('rejects non-positive prices and non-integer quantities', () => {
    expect(validateIpoRecord(ipo({ companyName: 'X', appliedPrice: 0 })).errors.join(' ')).toMatch(/Applied price/)
    expect(validateIpoRecord(ipo({ companyName: 'X', quantity: 1.5 })).errors.join(' ')).toMatch(/Quantity/)
  })
  it('warns (without blocking) on inconsistent figures', () => {
    const v = validateIpoRecord(ipo({ ...kotakApplied(), priceBandLow: 70, priceBandHigh: 75, lots: 13, lotSize: 10, applicationAmount: 15000 }))
    expect(v.errors).toEqual([])
    expect(v.warnings.join(' ')).toMatch(/outside the price band/)
    expect(v.warnings.join(' ')).toMatch(/lots × lot size/)
    expect(v.warnings.join(' ')).toMatch(/Application amount does not equal/)
  })
  it('cross-checks allotted shares × issue price against blocked − refund', () => {
    const v = validateIpoRecord(ipo({ ...kotakApplied(), status: 'PARTIALLY_ALLOTTED', allottedQuantity: 91, issuePrice: 80, refundAmount: 7000 }))
    expect(v.warnings.join(' ')).toMatch(/does not match blocked − refund/)
  })
  it('rejects exits on unlisted IPOs and oversized exits', () => {
    expect(validateIpoRecord(ipo({ ...kotakApplied(), exitQuantity: 5, exitPrice: 90 })).errors.join(' ')).toMatch(/listed/)
    expect(validateIpoRecord(ipo({ ...kotakApplied(), status: 'LISTED', allottedQuantity: 10, exitQuantity: 20, exitPrice: 90 })).errors.join(' ')).toMatch(/exceed allotted/)
  })
  it('rejects a refund larger than the blocked amount', () => {
    expect(validateIpoRecord(ipo({ ...kotakApplied(), status: 'PARTIALLY_ALLOTTED', allottedQuantity: 91, refundAmount: 99999 })).errors.join(' ')).toMatch(/Refund cannot exceed/)
  })
})

describe('timeline estimates', () => {
  it('counts working days from a Friday close (T+1 Mon, T+2 Tue, T+3 Wed)', () => {
    expect(estimateIpoTimeline('2026-10-30')).toMatchObject({ allotmentDate: '2026-11-02', refundDate: '2026-11-03', listingDate: '2026-11-04', basis: 'ESTIMATE' })
  })
  it('skips weekends mid-cycle (Wednesday close → listing Monday)', () => {
    expect(estimateIpoTimeline('2026-11-04')).toMatchObject({ allotmentDate: '2026-11-05', refundDate: '2026-11-06', listingDate: '2026-11-09' })
  })
  it('returns null without a valid close date', () => {
    expect(estimateIpoTimeline(null)).toBeNull()
    expect(estimateIpoTimeline('not-a-date')).toBeNull()
  })
  it('upcoming events prefer recorded dates over estimates and drop past ones', () => {
    const applied = ipo({ ...kotakApplied(), closeDate: '2026-10-30' })
    const recorded = ipo({ ...kotakApplied(), applicationNumber: 'B', closeDate: '2026-10-30', allotmentDate: '2026-11-03' })
    const allotted = ipo({ ...kotakApplied(), applicationNumber: 'C', status: 'ALLOTTED', allottedQuantity: 10, closeDate: '2026-10-30', listingDate: '2026-11-05' })
    const past = ipo({ ...kotakApplied(), applicationNumber: 'D', closeDate: '2026-10-01' })
    const events = getUpcomingEvents([applied, recorded, allotted, past], '2026-11-01')
    expect(events.map(e => [e.event, e.date, e.basis])).toEqual([
      ['ALLOTMENT', '2026-11-02', 'ESTIMATE'], ['ALLOTMENT', '2026-11-03', 'RECORDED'], ['LISTING', '2026-11-05', 'RECORDED'],
    ])
  })
})

describe('IPO analytics (separate from crypto)', () => {
  const book = () => [
    kotakApplied(), // APPLIED, ₹14,924 blocked
    ipo({ companyName: 'B', quantity: 100, appliedPrice: 100, blockedAmount: 10000, applicationAmount: 10000, status: 'NOT_ALLOTTED' }),
    ipo({ companyName: 'C', quantity: 100, appliedPrice: 100, blockedAmount: 10000, applicationAmount: 10000, status: 'PARTIALLY_ALLOTTED', allottedQuantity: 40, issuePrice: 100 }),
    ipo({ companyName: 'D', quantity: 100, appliedPrice: 100, blockedAmount: 10000, applicationAmount: 10000, status: 'LISTED', allottedQuantity: 100, issuePrice: 100, currentPrice: 120, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'MANUAL' }),
  ]
  it('aggregates counts, capital, refunds and P&L without double counting', () => {
    const a = getIpoAnalytics(book())
    expect(a.counts).toEqual({ APPLIED: 1, ALLOTTED: 0, PARTIALLY_ALLOTTED: 1, NOT_ALLOTTED: 1, LISTED: 1 })
    expect(a.totalApplicationAmount).toBe(44924)
    expect(a.fundsBlockedNow).toBe(14924) // only the still-APPLIED one
    expect(a.investedCapital).toBe(14000) // 4,000 (C) + 10,000 (D); not the 20,000 applied
  })
  it('refund total is each IPO’s blocked − invested', () => {
    // B: 10,000 − 0; C: 10,000 − 4,000 = 6,000; D: 10,000 − 10,000 = 0  →  16,000
    expect(getIpoAnalytics(book()).refundsReceived).toBe(16000)
  })
  it('allotment rate counts only decided applications', () => {
    expect(getIpoAnalytics(book()).allotmentRate).toBe(66.67) // 2 of 3 decided received shares
    expect(getIpoAnalytics([kotakApplied()]).allotmentRate).toBeNull()
  })
  it('P&L and return use only positions that have a price', () => {
    const a = getIpoAnalytics(book())
    expect(a.currentValue).toBe(12000)
    expect(a.unrealizedPnl).toBe(2000)
    expect(a.realizedPnl).toBe(0)
    expect(a.totalPnl).toBe(2000)
    expect(a.returnPct).toBe(20)
    expect(a.valuedCount).toBe(1)
  })
  it('flags incomplete records instead of guessing', () => {
    const missing = ipo({ companyName: 'E', status: 'APPLIED', quantity: 10, appliedPrice: 50, blockedAmount: null })
    const noCost = ipo({ companyName: 'F', status: 'ALLOTTED', allottedQuantity: 10 })
    const a = getIpoAnalytics([missing, noCost])
    expect(a.blockedUnknownCount).toBe(1)
    expect(a.investedUnknownCount).toBe(1)
    expect(a.incompleteIds).toEqual([missing.id, noCost.id])
  })
  it('handles an empty list', () => {
    const a = getIpoAnalytics([])
    expect(a.total).toBe(0)
    expect(a.returnPct).toBeNull()
    expect(a.allotmentRate).toBeNull()
  })
})

describe('combined portfolio', () => {
  const analytics = () => getIpoAnalytics([
    kotakApplied(), // 14,924 blocked
    ipo({ status: 'LISTED', allottedQuantity: 100, issuePrice: 100, currentPrice: 120, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'MANUAL' }), // 10,000 held, +2,000
  ])
  it('converts INR to USD and counts each rupee once', () => {
    const c = combinePortfolio({ cryptoRealizedPnlUsd: 100, cryptoOpenMarginUsd: 50, ipo: analytics(), fx: { rate: 0.012, date: '2026-10-30' } })
    expect(c.available).toBe(true)
    expect(c.ipoCapitalCommittedInr).toBe(24924) // 14,924 blocked + 10,000 held — not + refunds
    expect(c.capitalCommittedUsd).toBe(349.09) // 50 + 24,924 × 0.012
    expect(c.realizedPnlUsd).toBe(100) // IPO realized is 0
    expect(c.unrealizedIpoPnlUsd).toBe(24) // 2,000 × 0.012
    expect(c.rateDate).toBe('2026-10-30')
  })
  it('refuses to combine without an exchange rate rather than guessing one', () => {
    const c = combinePortfolio({ cryptoRealizedPnlUsd: 100, cryptoOpenMarginUsd: 50, ipo: analytics(), fx: null })
    expect(c.available).toBe(false)
    expect(c.capitalCommittedUsd).toBeNull()
    expect(c.realizedPnlUsd).toBeNull()
    expect(c.reason).toMatch(/exchange rate/)
  })
  it('marks capital incomplete when blocked amounts are unknown', () => {
    const a = getIpoAnalytics([ipo({ status: 'APPLIED', quantity: 10, appliedPrice: 50, blockedAmount: null })])
    expect(combinePortfolio({ cryptoRealizedPnlUsd: 0, cryptoOpenMarginUsd: 0, ipo: a, fx: { rate: 0.012, date: '2026-10-30' } }).capitalIncomplete).toBe(true)
  })
})
