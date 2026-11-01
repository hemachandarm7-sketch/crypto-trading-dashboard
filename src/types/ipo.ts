/** IPO domain types. All money is INR. `null` always means "unknown" — never zero, never assumed. */
export type IpoStatus = 'APPLIED' | 'ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'NOT_ALLOTTED' | 'LISTED'
export type IpoMandateType = 'ASBA' | 'UPI'
export type IpoBidType = 'CUTOFF' | 'LIMIT'
export type IpoType = 'MAINBOARD' | 'SME'
export type IpoPriceSource = 'MANUAL' | 'SCREENSHOT' | 'PROVIDER'
export type IpoExtractionKind = 'APPLICATION' | 'ALLOTMENT' | 'PRICE' | 'UNKNOWN'
export type IpoExtractionStatus = 'EXTRACTED' | 'CONFIRMED' | 'REJECTED'

export const IPO_STATUSES: readonly IpoStatus[] = ['APPLIED', 'ALLOTTED', 'PARTIALLY_ALLOTTED', 'NOT_ALLOTTED', 'LISTED']
export const IPO_STATUS_LABELS: Record<IpoStatus, string> = {
  APPLIED: 'Applied', ALLOTTED: 'Allotted', PARTIALLY_ALLOTTED: 'Partially allotted', NOT_ALLOTTED: 'Not allotted', LISTED: 'Listed',
}

export interface IpoTrade {
  id: string
  companyName: string
  symbol: string | null
  exchange: string | null
  ipoType: IpoType | null
  mandateType: IpoMandateType | null
  bidType: IpoBidType | null
  applicationNumber: string | null
  dpId: string | null
  clientId: string | null
  holdAccountMasked: string | null
  /** ISO dates, YYYY-MM-DD */
  openDate: string | null
  closeDate: string | null
  priceBandLow: number | null
  priceBandHigh: number | null
  cutoffPrice: number | null
  appliedPrice: number | null
  /** Final issue price shares were allotted at (can be below the bid price). */
  issuePrice: number | null
  lotSize: number | null
  lots: number | null
  quantity: number | null
  applicationAmount: number | null
  blockedAmount: number | null
  status: IpoStatus
  allotmentDate: string | null
  allottedQuantity: number | null
  refundAmount: number | null
  listingDate: string | null
  listingPrice: number | null
  currentPrice: number | null
  /** ISO timestamp of when `currentPrice` was observed. Required whenever currentPrice is set. */
  currentPriceAt: string | null
  currentPriceSource: IpoPriceSource | null
  exitPrice: number | null
  exitQuantity: number | null
  exitDate: string | null
  exitCharges: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type IpoDraft = Omit<IpoTrade, 'id' | 'createdAt' | 'updatedAt'>

export interface IpoExtraction {
  id: string
  ipoTradeId: string | null
  kind: IpoExtractionKind
  status: IpoExtractionStatus
  originalName: string | null
  sha256: string | null
  rawText: string
  ocrConfidence: number | null
  parsed: Record<string, unknown>
  confirmed: Record<string, unknown> | null
  createdAt: string
}

export function emptyIpoDraft(): IpoDraft {
  return {
    companyName: '', symbol: null, exchange: null, ipoType: null, mandateType: null, bidType: null,
    applicationNumber: null, dpId: null, clientId: null, holdAccountMasked: null,
    openDate: null, closeDate: null, priceBandLow: null, priceBandHigh: null, cutoffPrice: null,
    appliedPrice: null, issuePrice: null, lotSize: null, lots: null, quantity: null,
    applicationAmount: null, blockedAmount: null, status: 'APPLIED', allotmentDate: null,
    allottedQuantity: null, refundAmount: null, listingDate: null, listingPrice: null,
    currentPrice: null, currentPriceAt: null, currentPriceSource: null,
    exitPrice: null, exitQuantity: null, exitDate: null, exitCharges: null, notes: null,
  }
}

/** The editable shape of a saved IPO (drops server-managed fields). */
export function ipoToDraft(ipo: IpoTrade | null): IpoDraft {
  if (!ipo) return emptyIpoDraft()
  const { id: _id, createdAt: _created, updatedAt: _updated, ...draft } = ipo
  void _id; void _created; void _updated
  return draft
}
