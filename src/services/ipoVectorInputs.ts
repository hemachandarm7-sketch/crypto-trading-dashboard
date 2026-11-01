import type { IpoDraft } from '../types/ipo'

/** Inputs shared by the vector generator and its sync test. Case 1 is the user's real Kotak ASBA confirmation. */
export const ipoVectorInputs: { name: string; input: Partial<IpoDraft> }[] = [
  { name: 'applied (Kotak ASBA, 182 x 82)', input: { status: 'APPLIED', quantity: 182, appliedPrice: 82, applicationAmount: 14924, blockedAmount: 14924 } },
  { name: 'applied, blocked amount unknown', input: { status: 'APPLIED', quantity: 182, appliedPrice: 82 } },
  { name: 'full allotment at bid price', input: { status: 'ALLOTTED', quantity: 182, appliedPrice: 82, blockedAmount: 14924, allottedQuantity: 182, issuePrice: 82, refundAmount: 0 } },
  { name: 'partial allotment at lower issue price, refund derived', input: { status: 'PARTIALLY_ALLOTTED', quantity: 182, appliedPrice: 82, blockedAmount: 14924, allottedQuantity: 91, issuePrice: 80 } },
  { name: 'partial allotment, no issue price (blocked minus refund)', input: { status: 'PARTIALLY_ALLOTTED', quantity: 182, appliedPrice: 82, blockedAmount: 14924, allottedQuantity: 91, refundAmount: 7644 } },
  { name: 'allotted but cost unknown', input: { status: 'ALLOTTED', quantity: 182, appliedPrice: 82, blockedAmount: 14924, allottedQuantity: 91 } },
  { name: 'not allotted', input: { status: 'NOT_ALLOTTED', quantity: 182, appliedPrice: 82, blockedAmount: 14924 } },
  { name: 'listed with price: unrealized gain', input: { status: 'LISTED', quantity: 182, appliedPrice: 82, blockedAmount: 14924, allottedQuantity: 182, issuePrice: 82, refundAmount: 0, listingPrice: 95, currentPrice: 100.5, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'MANUAL' } },
  { name: 'listed with price: unrealized loss', input: { status: 'LISTED', quantity: 182, appliedPrice: 82, blockedAmount: 14924, allottedQuantity: 182, issuePrice: 82, currentPrice: 70, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'SCREENSHOT' } },
  { name: 'listed, price without timestamp is ignored', input: { status: 'LISTED', allottedQuantity: 182, issuePrice: 82, currentPrice: 100.5 } },
  { name: 'partial exit with charges plus unrealized', input: { status: 'LISTED', quantity: 100, appliedPrice: 100, blockedAmount: 10000, allottedQuantity: 100, issuePrice: 100, exitQuantity: 60, exitPrice: 130, exitCharges: 50, currentPrice: 120, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'SCREENSHOT' } },
  { name: 'lots times lot size', input: { status: 'APPLIED', lots: 13, lotSize: 14, appliedPrice: 82 } },
]
