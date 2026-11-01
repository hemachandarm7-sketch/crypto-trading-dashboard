import type { IpoDraft, IpoExtractionKind, IpoMandateType, IpoStatus, IpoTrade } from '../types/ipo'

/**
 * Parses OCR text from IPO application confirmations (ASBA / UPI), allotment notices and stock-price
 * screenshots. Pure and deterministic: it only reports what is present in the text. Anything it cannot
 * find stays undefined — it never infers allotment, prices or dates. Every field carries provenance and
 * the result carries issues the UI must show before the user confirms and saves.
 */

export type FieldSource = 'direct_ocr' | 'calculated'
export interface FieldProvenance { source: FieldSource; requiresConfirmation?: boolean; note?: string }

export interface ParsedBid { bidNumber: number; quantity: number; price: number; amount: number }

export interface IpoExtractedFields {
  companyName?: string
  symbol?: string
  applicationNumber?: string
  mandateType?: IpoMandateType
  dpId?: string
  clientId?: string
  holdAccountMasked?: string
  blockedAmount?: number
  quantity?: number
  appliedPrice?: number
  applicationAmount?: number
  /** Date the bank accepted the application (not the IPO open/close date). */
  acceptedOn?: string
  status?: IpoStatus
  allottedQuantity?: number
  issuePrice?: number
  refundAmount?: number
  allotmentDate?: string
  listingDate?: string
  currentPrice?: number
  currentPriceAt?: string
}

export interface IpoExtractionIssue { severity: 'error' | 'warning'; field?: string; message: string }

export interface IpoExtractionResult {
  kind: IpoExtractionKind
  fields: IpoExtractedFields
  /** All bids found. If more than one, quantity / price are intentionally left unset. */
  bids: ParsedBid[]
  provenance: Partial<Record<keyof IpoExtractedFields, FieldProvenance>>
  issues: IpoExtractionIssue[]
  ocrConfidence: number | null
  /** Verbatim OCR text, preserved for debugging. */
  rawText: string
}

const MONEY_TOLERANCE = 1
const AMOUNT = String.raw`\d[\d,]*(?:\.\d{1,2})?`
const parseAmount = (value: string): number => Number(value.replace(/,/g, ''))
const flatten = (text: string): string => text.replace(/[\u00a0\t]+/g, ' ').replace(/\s*\n\s*/g, ' ').replace(/ {2,}/g, ' ').trim()
const clean = (value: string): string => value.replace(/\s+/g, ' ').replace(/^[\s:.–-]+|[\s:.–-]+$/g, '')

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

function toIso(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

/** Indian formats are day-first: 31/10/2026, 31-10-2026, 31 Oct 2026, Oct 31, 2026. Returns ISO or null. */
export function parseIndianDate(text: string): string | null {
  const numeric = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/)
  if (numeric) return toIso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]))
  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s,-]+([A-Za-z]{3,9})[\s,.-]+(\d{4})\b/)
  if (dayFirst) { const month = MONTHS[dayFirst[2].slice(0, 4).toLowerCase()] ?? MONTHS[dayFirst[2].slice(0, 3).toLowerCase()]; if (month) return toIso(Number(dayFirst[3]), month, Number(dayFirst[1])) }
  const monthFirst = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/)
  if (monthFirst) { const month = MONTHS[monthFirst[1].slice(0, 4).toLowerCase()] ?? MONTHS[monthFirst[1].slice(0, 3).toLowerCase()]; if (month) return toIso(Number(monthFirst[3]), month, Number(monthFirst[2])) }
  return null
}

export function detectIpoScreenshotKind(text: string): IpoExtractionKind {
  const flat = flatten(text)
  if (/\bnot\s+(?:been\s+)?allot|no\s+allotment|allotment\s+(?:status|result)|shares?\s+allotted|allotted\s+(?:quantity|shares?)|quantity\s+allotted|\bpartially\s+allot|refund/i.test(flat)) return 'ALLOTMENT'
  if (/\bASBA\b|supported\s+by\s+blocked|\bUPI\s+mandate|mandate|bid\s+(?:quantity|price|amount)|\bhold\s+amount/i.test(flat) && /application|bid|hold/i.test(flat)) return 'APPLICATION'
  if (/\bLTP\b|last\s+traded|market\s+price|prev(?:ious)?\.?\s+close|day'?s?\s+(?:high|low)|\b52\s*w/i.test(flat)) return 'PRICE'
  return 'UNKNOWN'
}

function setField<K extends keyof IpoExtractedFields>(result: IpoExtractionResult, key: K, value: IpoExtractedFields[K], provenance: FieldProvenance = { source: 'direct_ocr' }): void {
  if (value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))) return
  result.fields[key] = value
  result.provenance[key] = provenance
}

function extractCommon(flat: string, result: IpoExtractionResult): void {
  const appNo = flat.match(/\bApplication(?:\s*(?:Number|No\.?))?\s*[:-]?\s*(\d{10,}[A-Z]{0,6})\b/i) ?? flat.match(/\b(\d{12,}[A-Z]{2,6})\b/)
  if (appNo) setField(result, 'applicationNumber', appNo[1].toUpperCase())

  const labelled = flat.match(/\bCompany\s*Name\s*[:-]?\s*(.+?)\s*(?=Hold\s*Account|Hold\s*Amount|DP\s*ID|Client\s*ID|Bid\s*Number|$)/i)
  const colonLabelled = flat.match(/\b(?:Company|Issuer|IPO\s*Name|Issue\s*Name)\s*[:-]\s*(.+?)\s*(?=Application|Shares?\s+Allot|Allot|Refund|Quantity|Status|Date|Bid\s|Hold|DP\s*ID|Client|$)/i)
  const sentence = flat.match(/\b(?:application|request)\b.{0,80}?\bfor\s+(.{3,90}?)\s+of\s+(?:[^\d\s]{0,3}\s*)?\d[\d,]*(?:\.\d\d)?\s+has\s+been/i)
  const company = labelled ? clean(labelled[1].replace(/\s+Name$/i, '')) : colonLabelled ? clean(colonLabelled[1]) : sentence ? clean(sentence[1]) : ''
  if (company.length >= 3) setField(result, 'companyName', company, { source: 'direct_ocr', requiresConfirmation: !labelled && !colonLabelled })
}

function extractApplication(flat: string, result: IpoExtractionResult): void {
  if (/\bASBA\b/i.test(flat)) setField(result, 'mandateType', 'ASBA')
  else if (/\bUPI\b/i.test(flat)) setField(result, 'mandateType', 'UPI')

  const holdAccount = flat.match(/\bHold\s*Account(?:\s*Number)?\s*[:-]?\s*([xX*•]{2,}\s?\d{3,6})/) ?? flat.match(/\bHold\s+([xX*•]{2,}\s?\d{3,6})\s+Account/)
  if (holdAccount) setField(result, 'holdAccountMasked', holdAccount[1].replace(/\s/g, '').toLowerCase())
  const hold = flat.match(new RegExp(String.raw`\bHold\s*Amount(?:\s*\(\s*[^)\d]{0,3}\s*\))?\s*[:-]?\s*(${AMOUNT})`, 'i'))
    ?? flat.match(new RegExp(String.raw`\bHold\s+(${AMOUNT})\s+Amount`, 'i'))
  if (hold) setField(result, 'blockedAmount', parseAmount(hold[1]))
  const dp = flat.match(/\bDP\s*ID\s*[:-]?\s*(IN\d{6}|\d{8})\b/i)
  if (dp) setField(result, 'dpId', dp[1].toUpperCase())
  const client = flat.match(/\bClient\s*ID\s*[:-]?\s*(\d{6,16})\b/i)
  if (client) setField(result, 'clientId', client[1])

  const accepted = flat.match(/accepted\s+successfully\s+on\s+(\S+(?:\s+[A-Za-z]{3,9}\s+\d{4})?)/i)
  const acceptedIso = accepted ? parseIndianDate(accepted[1]) : null
  if (acceptedIso) setField(result, 'acceptedOn', acceptedIso)

  // Bid table rows: "<bid #> <quantity> <price> <amount>". A mandate can carry up to three bids.
  const rows = [...flat.matchAll(new RegExp(String.raw`(?:^|\s)(\d{1,2})\s+(\d{1,7})\s+(\d{1,6}(?:\.\d{1,2})?)\s+(${AMOUNT})(?=\s|$)`, 'g'))]
  const afterHeader = flat.search(/Bid\s*Amount/i)
  for (const row of rows) {
    if (afterHeader >= 0 && (row.index ?? 0) < afterHeader) continue
    const bid: ParsedBid = { bidNumber: Number(row[1]), quantity: Number(row[2]), price: Number(row[3]), amount: parseAmount(row[4]) }
    if (bid.bidNumber >= 1 && bid.bidNumber <= 3 && bid.quantity > 0 && bid.price > 0) result.bids.push(bid)
  }
  if (result.bids.length === 1) {
    const [bid] = result.bids
    setField(result, 'quantity', bid.quantity)
    setField(result, 'appliedPrice', bid.price)
    setField(result, 'applicationAmount', bid.amount)
    if (Math.abs(bid.quantity * bid.price - bid.amount) > MONEY_TOLERANCE) {
      result.issues.push({ severity: 'error', field: 'applicationAmount', message: `Bid amount ₹${bid.amount} does not equal quantity × price (₹${Math.round(bid.quantity * bid.price * 100) / 100}). One of the OCR values is probably misread — correct it before saving.` })
    }
  } else if (result.bids.length > 1) {
    const total = result.bids.reduce((sum, bid) => sum + bid.amount, 0)
    setField(result, 'applicationAmount', Math.round(total * 100) / 100, { source: 'calculated', requiresConfirmation: true, note: 'Sum of all bids' })
    result.issues.push({ severity: 'warning', field: 'quantity', message: `${result.bids.length} bids were found. Quantity and applied price are left blank — enter the bid you want to track.` })
  } else {
    result.issues.push({ severity: 'warning', field: 'quantity', message: 'No bid table row (number, quantity, price, amount) was recognised.' })
  }

  const applicationAmount = result.fields.applicationAmount
  const blocked = result.fields.blockedAmount
  if (applicationAmount != null && blocked != null && Math.abs(applicationAmount - blocked) > MONEY_TOLERANCE) {
    result.issues.push({ severity: 'warning', field: 'blockedAmount', message: `Hold amount ₹${blocked} differs from the bid amount ₹${applicationAmount}.` })
  }
}

function extractAllotment(flat: string, result: IpoExtractionResult): void {
  let status: IpoStatus | undefined
  if (/\bnot\s+(?:been\s+)?allot|no\s+allotment|unsuccessful/i.test(flat)) status = 'NOT_ALLOTTED'
  else if (/\bpartial(?:ly)?\s+allot/i.test(flat)) status = 'PARTIALLY_ALLOTTED'
  const quantityMatch = flat.match(/(?:shares?\s+allotted|allotted\s+(?:quantity|shares?)|quantity\s+allotted|no\.?\s*of\s*shares\s*allotted)\s*[:-]?\s*(\d[\d,]*)/i)
    ?? flat.match(/\b(\d[\d,]*)\s+(?:equity\s+)?shares?\s+(?:have\s+been\s+|were\s+|are\s+)?allotted/i)
  if (quantityMatch) {
    const quantity = Number(quantityMatch[1].replace(/,/g, ''))
    setField(result, 'allottedQuantity', quantity)
    if (!status && quantity > 0) status = 'ALLOTTED'
    if (!status && quantity === 0) status = 'NOT_ALLOTTED'
  }
  if (!status && /\ballot(?:ted|ment\s+(?:successful|confirmed))/i.test(flat)) {
    result.issues.push({ severity: 'warning', field: 'status', message: 'The text mentions allotment but no share count was found, so the status was not set. Enter the allotted shares.' })
  }
  if (status === 'NOT_ALLOTTED' && result.fields.allottedQuantity == null) setField(result, 'allottedQuantity', 0)
  if (status) setField(result, 'status', status)

  const refund = flat.match(new RegExp(String.raw`\brefund(?:ed|\s*amount)?(?:\s*\(\s*[^)\d]{0,3}\s*\))?\s*[:-]?\s*(?:[^\d\s]{0,3}\s*)?(${AMOUNT})`, 'i'))
  if (refund) setField(result, 'refundAmount', parseAmount(refund[1]))
  const issue = flat.match(new RegExp(String.raw`\b(?:issue|allotment|allot(?:ted)?)\s*price\s*[:-]?\s*(?:[^\d\s]{0,3}\s*)?(${AMOUNT})`, 'i'))
  if (issue) setField(result, 'issuePrice', parseAmount(issue[1]))
  const allotDate = flat.match(/(?:allotment\s*date|allotted\s*on|date\s*of\s*allotment)\s*[:-]?\s*([0-9A-Za-z ,/.-]{6,20})/i)
  const allotIso = allotDate ? parseIndianDate(allotDate[1]) : null
  if (allotIso) setField(result, 'allotmentDate', allotIso)
  const listDate = flat.match(/(?:listing\s*date|date\s*of\s*listing|listed\s*on)\s*[:-]?\s*([0-9A-Za-z ,/.-]{6,20})/i)
  const listIso = listDate ? parseIndianDate(listDate[1]) : null
  if (listIso) setField(result, 'listingDate', listIso)
}

function extractPrice(flat: string, result: IpoExtractionResult): void {
  const symbol = flat.match(/\b(?:NSE|BSE)\s*[:-]\s*([A-Z][A-Z0-9&-]{1,14})\b/)
  if (symbol) setField(result, 'symbol', symbol[1])
  const labelled = flat.match(new RegExp(String.raw`\b(?:LTP|last\s+traded\s+price|market\s+price|current\s+price)\s*[:-]?\s*(?:[^\d\s]{0,3}\s*)?(\d[\d,]*\.\d{1,2})`, 'i'))
  if (labelled) setField(result, 'currentPrice', parseAmount(labelled[1]))
  else {
    const symbolPrice = flat.match(/[₹]\s*(\d[\d,]*\.\d{2})\b/)
    if (symbolPrice) {
      setField(result, 'currentPrice', parseAmount(symbolPrice[1]), { source: 'direct_ocr', requiresConfirmation: true, note: 'Unlabelled ₹ amount — confirm it is the current price.' })
      result.issues.push({ severity: 'warning', field: 'currentPrice', message: 'The price was not labelled (LTP / market price). Confirm it is the current price.' })
    }
  }
  if (result.fields.currentPrice == null) result.issues.push({ severity: 'warning', field: 'currentPrice', message: 'No current price was recognised.' })
  const stamp = flat.match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\D{0,12}(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?/)
  if (stamp) {
    const iso = parseIndianDate(stamp[1])
    if (iso) {
      let hour = Number(stamp[2]); const minute = Number(stamp[3]); const meridiem = stamp[4]?.toLowerCase()
      if (meridiem === 'pm' && hour < 12) hour += 12
      if (meridiem === 'am' && hour === 12) hour = 0
      if (hour <= 23 && minute <= 59) setField(result, 'currentPriceAt', `${iso}T${String(hour).padStart(2, '0')}:${stamp[3]}:00+05:30`, { source: 'direct_ocr', note: 'Read from the screenshot, interpreted as IST.' })
    }
  }
}

export function parseIpoScreenshotText(text: string, ocrConfidence?: number | null, forcedKind?: IpoExtractionKind): IpoExtractionResult {
  const result: IpoExtractionResult = { kind: forcedKind ?? detectIpoScreenshotKind(text), fields: {}, bids: [], provenance: {}, issues: [], ocrConfidence: ocrConfidence ?? null, rawText: text }
  const flat = flatten(text)
  if (!flat) { result.issues.push({ severity: 'error', message: 'No text was recognised in the image.' }); return result }
  if (result.kind === 'UNKNOWN') { result.issues.push({ severity: 'error', message: 'This does not look like an IPO application, allotment or price screenshot. Pick the type manually or enter the details by hand.' }); return result }

  extractCommon(flat, result)
  if (result.kind === 'APPLICATION') extractApplication(flat, result)
  if (result.kind === 'ALLOTMENT') extractAllotment(flat, result)
  if (result.kind === 'PRICE') extractPrice(flat, result)

  if (ocrConfidence != null && ocrConfidence < 0.6) result.issues.push({ severity: 'warning', message: `OCR confidence is low (${Math.round(ocrConfidence * 100)}%). Check every value.` })
  return result
}

/** Allotment status can be reconciled once the applied quantity is known: fewer shares than bid = partial. Marked calculated. */
export function reconcileAllotmentStatus(fields: Pick<IpoExtractedFields, 'status' | 'allottedQuantity'>, appliedQuantity: number | null | undefined): { status: IpoStatus | undefined; reconciled: boolean } {
  const { status, allottedQuantity } = fields
  if (allottedQuantity == null || appliedQuantity == null || appliedQuantity <= 0) return { status, reconciled: false }
  if (allottedQuantity === 0) return { status: 'NOT_ALLOTTED', reconciled: status !== 'NOT_ALLOTTED' }
  const next: IpoStatus = allottedQuantity < appliedQuantity ? 'PARTIALLY_ALLOTTED' : 'ALLOTTED'
  return { status: next, reconciled: next !== status }
}

const normaliseName = (name: string): string => name.toLowerCase().replace(/\b(ltd|limited|pvt|private|inc)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Link a screenshot to an existing IPO: exact application number first, then an unambiguous company-name match. */
export function findMatchingIpo(ipos: IpoTrade[], fields: Pick<IpoExtractedFields, 'applicationNumber' | 'companyName' | 'symbol'>): IpoTrade | null {
  if (fields.applicationNumber) {
    const exact = ipos.find(ipo => ipo.applicationNumber?.toUpperCase() === fields.applicationNumber?.toUpperCase())
    if (exact) return exact
  }
  const matches: IpoTrade[] = []
  if (fields.companyName) {
    const target = normaliseName(fields.companyName)
    if (target) matches.push(...ipos.filter(ipo => normaliseName(ipo.companyName) === target))
  }
  if (!matches.length && fields.symbol) matches.push(...ipos.filter(ipo => ipo.symbol?.toUpperCase() === fields.symbol?.toUpperCase()))
  return matches.length === 1 ? matches[0] : null
}

/** Only extracted fields are returned, so applying the patch can never overwrite a value with a guess. */
export function extractionToIpoPatch(result: IpoExtractionResult, options: { observedAt?: string } = {}): Partial<IpoDraft> {
  const f = result.fields
  const patch: Partial<IpoDraft> = {}
  const assign = <K extends keyof IpoDraft>(key: K, value: IpoDraft[K] | undefined) => { if (value !== undefined) patch[key] = value }
  assign('companyName', f.companyName); assign('symbol', f.symbol ?? undefined)
  assign('applicationNumber', f.applicationNumber); assign('mandateType', f.mandateType)
  assign('dpId', f.dpId); assign('clientId', f.clientId); assign('holdAccountMasked', f.holdAccountMasked)
  assign('quantity', f.quantity); assign('appliedPrice', f.appliedPrice)
  assign('applicationAmount', f.applicationAmount); assign('blockedAmount', f.blockedAmount)
  assign('status', f.status); assign('allottedQuantity', f.allottedQuantity); assign('issuePrice', f.issuePrice)
  assign('refundAmount', f.refundAmount); assign('allotmentDate', f.allotmentDate); assign('listingDate', f.listingDate)
  if (f.currentPrice != null) {
    patch.currentPrice = f.currentPrice
    patch.currentPriceSource = 'SCREENSHOT'
    // Prefer the time printed on the screenshot; otherwise the caller-supplied observation time (editable in the UI).
    patch.currentPriceAt = f.currentPriceAt ?? options.observedAt ?? null
  }
  return patch
}
