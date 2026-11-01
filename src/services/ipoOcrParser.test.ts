import { describe, expect, it } from 'vitest'
import { detectIpoScreenshotKind, extractionToIpoPatch, findMatchingIpo, parseIndianDate, parseIpoScreenshotText, reconcileAllotmentStatus } from './ipoOcrParser'
import { emptyIpoDraft, type IpoTrade } from '../types/ipo'

/**
 * FIXTURE PROVENANCE: KOTAK_CLEAN is hand-transcribed from the user's real Kotak Mahindra Bank ASBA
 * confirmation screenshot (the sandbox cannot download Tesseract language data, so real OCR output was not
 * available). The NOISY variants reproduce how Tesseract typically mangles table layouts.
 */
const KOTAK_CLEAN = `Dear M Hemachandar,

Your request for Application Supported by Blocked Amount (ASBA)
application no. 179346627148EFAV for Bombay Coated and Special
Steels Limited of ₹ 14,924.00 has been accepted successfully on
31/10/2026.

Application Number 179346627148EFAV
Company Name Bombay Coated and Special Steels Limited
Hold Account Number xxxx2284
Hold Amount(₹) 14,924.00
DP ID IN300214
Client ID 96648025

Bid Number Bid Quantity Bid Price Bid Amount (₹)
1 182 82.00 14,924.00

For any assistance, kindly get in touch with our Customer Support team at
18004100

Warm regards,
Team Kotak Mahindra Bank`

// Wrapped table-cell labels interleave with values, as Tesseract often reads them.
const KOTAK_WRAPPED = `Your request for Application Supported by Blocked Amount (ASBA)
application no. 179346627148EFAV for Bombay Coated and Special
Steels Limited of ₹ 14,924.00 has been accepted successfully on
31/10/2026.
Application 179346627148EFAV
Number
Company Bombay Coated and
Name Special Steels Limited
Hold xxxx2284
Account
Number
Hold 14,924.00
Amount(₹)
DP ID IN300214
Client ID 96648025
Bid Bid Bid Bid
Number Quantity Price Amount
(₹)
1 182 82.00 14,924.00`

describe('Kotak ASBA application confirmation (real screenshot)', () => {
  const result = parseIpoScreenshotText(KOTAK_CLEAN, 0.93)
  it('is classified as an application', () => { expect(result.kind).toBe('APPLICATION') })
  it('extracts every identifier and the mandate type', () => {
    expect(result.fields).toMatchObject({
      companyName: 'Bombay Coated and Special Steels Limited', applicationNumber: '179346627148EFAV', mandateType: 'ASBA',
      dpId: 'IN300214', clientId: '96648025', holdAccountMasked: 'xxxx2284', acceptedOn: '2026-10-31',
    })
  })
  it('extracts the bid and hold amounts', () => {
    expect(result.bids).toEqual([{ bidNumber: 1, quantity: 182, price: 82, amount: 14924 }])
    expect(result.fields).toMatchObject({ quantity: 182, appliedPrice: 82, applicationAmount: 14924, blockedAmount: 14924 })
  })
  it('raises no issues for a consistent screenshot', () => { expect(result.issues).toEqual([]) })
  it('does NOT invent fields the screenshot does not contain', () => {
    for (const key of ['status', 'allottedQuantity', 'issuePrice', 'refundAmount', 'allotmentDate', 'listingDate', 'currentPrice', 'symbol'] as const) {
      expect(result.fields[key]).toBeUndefined()
    }
  })
  it('treats the acceptance date as the acceptance date, not the IPO open/close date', () => {
    const patch = extractionToIpoPatch(result)
    expect(patch).not.toHaveProperty('openDate')
    expect(patch).not.toHaveProperty('closeDate')
    expect(patch).not.toHaveProperty('status')
  })
  it('preserves the raw OCR text and confidence for debugging', () => {
    expect(result.rawText).toBe(KOTAK_CLEAN)
    expect(result.ocrConfidence).toBe(0.93)
  })
  it('marks the table-labelled company name as not needing confirmation', () => { expect(result.provenance.companyName?.requiresConfirmation).toBe(false) })
})

describe('Tesseract-style wrapped table layout', () => {
  const result = parseIpoScreenshotText(KOTAK_WRAPPED, 0.88)
  it('still recovers the key numbers', () => {
    expect(result.fields).toMatchObject({ applicationNumber: '179346627148EFAV', blockedAmount: 14924, quantity: 182, appliedPrice: 82, applicationAmount: 14924, dpId: 'IN300214', clientId: '96648025', holdAccountMasked: 'xxxx2284' })
  })
  it('falls back to the sentence for the company name and asks for confirmation', () => {
    expect(result.fields.companyName).toBe('Bombay Coated and Special Steels Limited')
    expect(result.provenance.companyName?.requiresConfirmation).toBe(true)
  })
})

describe('validation of extracted values', () => {
  it('errors when OCR misreads an amount so quantity × price ≠ amount', () => {
    const misread = parseIpoScreenshotText(KOTAK_CLEAN.replace('1 182 82.00 14,924.00', '1 182 82.00 14,824.00'))
    expect(misread.issues.some(issue => issue.severity === 'error' && /quantity × price/.test(issue.message))).toBe(true)
  })
  it('warns when the hold amount differs from the bid amount', () => {
    const differing = parseIpoScreenshotText(KOTAK_CLEAN.replace('Hold Amount(₹) 14,924.00', 'Hold Amount(₹) 15,000.00'))
    expect(differing.issues.some(issue => issue.field === 'blockedAmount' && issue.severity === 'warning')).toBe(true)
  })
  it('leaves quantity and price blank when several bids are present, and sums the amount as a calculated value', () => {
    const multi = parseIpoScreenshotText(`${KOTAK_CLEAN}\n2 182 80.00 14,560.00`)
    expect(multi.bids).toHaveLength(2)
    expect(multi.fields.quantity).toBeUndefined()
    expect(multi.fields.appliedPrice).toBeUndefined()
    expect(multi.fields.applicationAmount).toBe(29484)
    expect(multi.provenance.applicationAmount).toMatchObject({ source: 'calculated', requiresConfirmation: true })
    expect(multi.issues.some(issue => /2 bids/.test(issue.message))).toBe(true)
  })
  it('warns on low OCR confidence', () => {
    expect(parseIpoScreenshotText(KOTAK_CLEAN, 0.4).issues.some(issue => /confidence is low/.test(issue.message))).toBe(true)
  })
  it('rejects empty and unrecognisable text instead of guessing', () => {
    expect(parseIpoScreenshotText('   ').issues[0].severity).toBe('error')
    const unknown = parseIpoScreenshotText('Order of the day: pizza margherita, 2 pieces, total 14,924.00')
    expect(unknown.kind).toBe('UNKNOWN')
    expect(unknown.fields).toEqual({})
    expect(unknown.issues[0].severity).toBe('error')
  })
})

describe('allotment screenshots', () => {
  it('reads a full allotment', () => {
    const r = parseIpoScreenshotText('Allotment Status\nApplication No: 179346627148EFAV\nCompany: Bombay Coated and Special Steels Limited\nShares Allotted: 182\nIssue Price: ₹ 82.00\nRefund Amount: 0.00\nAllotment Date: 03/11/2026')
    expect(r.kind).toBe('ALLOTMENT')
    expect(r.fields).toMatchObject({ applicationNumber: '179346627148EFAV', companyName: 'Bombay Coated and Special Steels Limited', allottedQuantity: 182, status: 'ALLOTTED', issuePrice: 82, refundAmount: 0, allotmentDate: '2026-11-03' })
  })
  it('reads "not allotted" and records zero shares', () => {
    const r = parseIpoScreenshotText('Dear Investor, your application 179346627148EFAV has not been allotted any shares in the IPO. Hold amount will be released.')
    expect(r.fields).toMatchObject({ applicationNumber: '179346627148EFAV', status: 'NOT_ALLOTTED', allottedQuantity: 0 })
  })
  it('reads a partial allotment', () => {
    const r = parseIpoScreenshotText('Application No: 179346627148EFAV\nPartially allotted\nShares Allotted: 91\nRefund Amount: 7,644.00')
    expect(r.fields).toMatchObject({ status: 'PARTIALLY_ALLOTTED', allottedQuantity: 91, refundAmount: 7644 })
  })
  it('does not set a status when allotment is mentioned without a share count', () => {
    const r = parseIpoScreenshotText('Allotment status for application 179346627148EFAV: allotted. Check demat for details.')
    expect(r.fields.status).toBeUndefined()
    expect(r.issues.some(issue => issue.field === 'status')).toBe(true)
  })
  it('reconciles status against the applied quantity and marks it calculated', () => {
    expect(reconcileAllotmentStatus({ status: 'ALLOTTED', allottedQuantity: 91 }, 182)).toEqual({ status: 'PARTIALLY_ALLOTTED', reconciled: true })
    expect(reconcileAllotmentStatus({ status: 'ALLOTTED', allottedQuantity: 182 }, 182)).toEqual({ status: 'ALLOTTED', reconciled: false })
    expect(reconcileAllotmentStatus({ status: 'ALLOTTED', allottedQuantity: 0 }, 182)).toEqual({ status: 'NOT_ALLOTTED', reconciled: true })
    expect(reconcileAllotmentStatus({ status: 'ALLOTTED', allottedQuantity: 91 }, null)).toEqual({ status: 'ALLOTTED', reconciled: false })
  })
})

describe('stock price screenshots', () => {
  it('reads a labelled LTP with its on-screen timestamp (IST)', () => {
    const r = parseIpoScreenshotText('NSE: BCSSL\nLTP ₹ 104.35\nPrev. close 98.10\n12/11/2026 03:29 PM')
    expect(r.kind).toBe('PRICE')
    expect(r.fields).toMatchObject({ symbol: 'BCSSL', currentPrice: 104.35, currentPriceAt: '2026-11-12T15:29:00+05:30' })
    expect(r.issues).toEqual([])
  })
  it('asks for confirmation when the price is unlabelled', () => {
    const r = parseIpoScreenshotText('Bombay Coated\nPrev. close 98.10\n₹104.35')
    expect(r.fields.currentPrice).toBe(104.35)
    expect(r.provenance.currentPrice?.requiresConfirmation).toBe(true)
    expect(r.issues.some(issue => issue.field === 'currentPrice')).toBe(true)
  })
  it('never fabricates a timestamp: it is only set when printed on the screenshot', () => {
    const r = parseIpoScreenshotText('LTP ₹ 104.35  Prev. close 98.10')
    expect(r.fields.currentPriceAt).toBeUndefined()
    expect(extractionToIpoPatch(r).currentPriceAt).toBeNull()
  })
  it('uses the caller-supplied observation time only when the screenshot has none', () => {
    const r = parseIpoScreenshotText('LTP ₹ 104.35  Prev. close 98.10')
    expect(extractionToIpoPatch(r, { observedAt: '2026-11-12T10:00:00Z' })).toMatchObject({ currentPrice: 104.35, currentPriceSource: 'SCREENSHOT', currentPriceAt: '2026-11-12T10:00:00Z' })
  })
})

describe('kind detection', () => {
  it('prioritises allotment over application wording', () => {
    expect(detectIpoScreenshotKind('ASBA application 123 — shares allotted: 10')).toBe('ALLOTMENT')
  })
  it('detects UPI mandate applications', () => {
    const r = parseIpoScreenshotText('UPI mandate created. Application number 179346627148EFAV bid quantity 14 bid price 100.00 bid amount 1,400.00 hold amount 1,400.00')
    expect(r.kind).toBe('APPLICATION')
    expect(r.fields.mandateType).toBe('UPI')
  })
})

describe('parseIndianDate (day-first)', () => {
  it.each([
    ['31/10/2026', '2026-10-31'], ['03-11-2026', '2026-11-03'], ['3 Nov 2026', '2026-11-03'],
    ['03 November 2026', '2026-11-03'], ['Nov 3, 2026', '2026-11-03'], ['5th Nov, 2026', '2026-11-05'],
  ])('%s → %s', (input, expected) => { expect(parseIndianDate(input)).toBe(expected) })
  it('treats 03/11/2026 as 3 November, never 11 March', () => { expect(parseIndianDate('03/11/2026')).toBe('2026-11-03') })
  it.each(['31/02/2026', '45/13/2026', 'hello', '2026'])('rejects %s', input => { expect(parseIndianDate(input)).toBeNull() })
})

describe('matching screenshots to saved IPOs', () => {
  const mk = (id: string, companyName: string, applicationNumber: string | null, symbol: string | null = null): IpoTrade => ({ ...emptyIpoDraft(), id, companyName, applicationNumber, symbol, createdAt: '', updatedAt: '' })
  const ipos = [mk('a', 'Bombay Coated and Special Steels Limited', '179346627148EFAV', 'BCSSL'), mk('b', 'Other Industries Ltd', 'ZZ999')]
  it('matches by application number first', () => { expect(findMatchingIpo(ipos, { applicationNumber: '179346627148efav' })?.id).toBe('a') })
  it('falls back to a normalised company name', () => { expect(findMatchingIpo(ipos, { companyName: 'bombay coated and special steels ltd.' })?.id).toBe('a') })
  it('falls back to the ticker', () => { expect(findMatchingIpo(ipos, { symbol: 'bcssl' })?.id).toBe('a') })
  it('refuses to guess when a name is ambiguous or unknown', () => {
    expect(findMatchingIpo([...ipos, mk('c', 'Other Industries Limited', null)], { companyName: 'Other Industries' })).toBeNull()
    expect(findMatchingIpo(ipos, { companyName: 'Nonexistent Co' })).toBeNull()
    expect(findMatchingIpo(ipos, {})).toBeNull()
  })
})

describe('extractionToIpoPatch', () => {
  it('maps only fields that were actually extracted', () => {
    const patch = extractionToIpoPatch(parseIpoScreenshotText(KOTAK_CLEAN))
    expect(Object.keys(patch).sort()).toEqual(['applicationAmount', 'applicationNumber', 'appliedPrice', 'blockedAmount', 'clientId', 'companyName', 'dpId', 'holdAccountMasked', 'mandateType', 'quantity'])
    expect(patch).toMatchObject({ companyName: 'Bombay Coated and Special Steels Limited', quantity: 182, appliedPrice: 82, applicationAmount: 14924, blockedAmount: 14924, mandateType: 'ASBA' })
  })
})
