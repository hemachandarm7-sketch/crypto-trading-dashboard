import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../services/supabaseClient', () => ({ requireSupabase: () => { throw new Error('not used in render tests') }, ensureSupabaseUser: async () => 'user-uuid' }))

import { IpoDetail, IpoEditor, IpoImportModal, IpoPage, IpoStatusBadge, TradeTypeSwitch } from './IpoScreens'
import { emptyIpoDraft, type IpoTrade } from '../types/ipo'

const mk = (overrides: Partial<IpoTrade> = {}): IpoTrade => ({
  ...emptyIpoDraft(), id: 'ipo-1', createdAt: '2026-10-31T09:00:00Z', updatedAt: '2026-10-31T09:00:00Z',
  companyName: 'Bombay Coated and Special Steels Limited', applicationNumber: '179346627148EFAV', mandateType: 'ASBA',
  quantity: 182, appliedPrice: 82, applicationAmount: 14924, blockedAmount: 14924, closeDate: '2026-10-30', status: 'APPLIED', ...overrides,
})
const noop = () => undefined
const pageProps = { loadError: null, onAdd: noop, onImport: noop, onOpen: noop, cryptoRealizedPnlUsd: 0, cryptoOpenMarginUsd: 0 }

describe('IpoPage', () => {
  it('shows the Kotak application with its real amounts and a blocked-funds total', () => {
    const html = renderToStaticMarkup(<IpoPage ipos={[mk()]} {...pageProps}/>)
    expect(html).toContain('Bombay Coated and Special Steels Limited')
    expect(html).toContain('₹14,924.00')
    expect(html).toContain('182 × ₹82.00')
    expect(html).toContain('Funds blocked now')
    expect(html).toContain('>Applied<')
  })
  it('does not show invested capital, P&L or value for an application that has no allotment', () => {
    const html = renderToStaticMarkup(<IpoPage ipos={[mk()]} {...pageProps}/>)
    expect(html).toMatch(/Invested capital<\/span>.*?<strong class="stat-value ">₹0\.00</s)
    expect(html).toMatch(/Total P&amp;L<\/span>.*?<strong class="stat-value ">—</s)
    expect(html).toMatch(/Current value<\/span>.*?<strong class="stat-value ">—</s)
  })
  it('shows an estimated (not recorded) allotment date from the close date', () => {
    const html = renderToStaticMarkup(<IpoPage ipos={[mk()]} {...pageProps}/>)
    expect(html).toContain('Estimate')
  })
  it('has a useful empty state', () => {
    const html = renderToStaticMarkup(<IpoPage ipos={[]} {...pageProps}/>)
    expect(html).toContain('No IPOs yet')
    expect(html).toContain('Add IPO')
    expect(html).toContain('Upload screenshot')
  })
  it('explains the migration when the table cannot be loaded', () => {
    const html = renderToStaticMarkup(<IpoPage ipos={[]} {...pageProps} loadError='relation "ipo_trades" does not exist'/>)
    expect(html).toContain('IPO data could not be loaded')
    expect(html).toContain('012_ipo_tracking.sql')
  })
  it('renders listed P&L with sign and the stored price', () => {
    const listed = mk({ status: 'LISTED', allottedQuantity: 182, issuePrice: 82, refundAmount: 0, currentPrice: 100.5, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'MANUAL', listingDate: '2026-11-05' })
    const html = renderToStaticMarkup(<IpoPage ipos={[listed]} {...pageProps}/>)
    expect(html).toContain('₹3,367.00') // 182 × (100.5 − 82)
    expect(html).toContain('+22.56%')
    expect(html).toContain('₹18,291.00')
    expect(html).toContain('class="positive"')
  })
})

describe('IpoEditor', () => {
  it('opens a blank form with the Crypto/IPO switch and cannot be saved without a company', () => {
    const html = renderToStaticMarkup(<IpoEditor ipo={null} onClose={noop} onSave={async () => undefined} working={false} typeSwitch={<TradeTypeSwitch value="IPO" onChange={noop}/>}/>)
    expect(html).toContain('Add IPO')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('Company name is required.')
    expect(html).toMatch(/<button class="button button-primary" type="submit" disabled=""/)
  })
  it('hides allotment fields while Applied and states that allotment is not assumed', () => {
    const html = renderToStaticMarkup(<IpoEditor ipo={mk()} onClose={noop} onSave={async () => undefined} working={false}/>)
    expect(html).not.toContain('Allotted shares')
    expect(html).toContain('Allotment is never assumed')
    expect(html).toContain('Application amount')
  })
  it('blocks saving an allotted status that has no allotted shares', () => {
    const html = renderToStaticMarkup(<IpoEditor ipo={mk()} initial={{ status: 'ALLOTTED' }} onClose={noop} onSave={async () => undefined} working={false}/>)
    expect(html).toContain('Enter the number of allotted shares')
    expect(html).toMatch(/type="submit" disabled=""/)
  })
  it('enables saving once the record is valid and shows calculated figures', () => {
    const html = renderToStaticMarkup(<IpoEditor ipo={mk()} initial={{ status: 'ALLOTTED', allottedQuantity: 91, issuePrice: 80 }} onClose={noop} onSave={async () => undefined} working={false}/>)
    expect(html).not.toMatch(/type="submit" disabled=""/)
    expect(html).toContain('₹7,280.00') // 91 × 80
    expect(html).toContain('₹7,644.00 (derived)') // refund
  })
  it('offers date estimates only as an explicit action, never pre-filling them', () => {
    const html = renderToStaticMarkup(<IpoEditor ipo={mk({ status: 'ALLOTTED', allottedQuantity: 182, issuePrice: 82 })} onClose={noop} onSave={async () => undefined} working={false}/>)
    expect(html).toContain('Use estimates')
    expect(html).not.toMatch(/name="allotmentDate"[^>]*value="2026/)
  })
})

describe('IpoDetail', () => {
  const listed = mk({ status: 'LISTED', allottedQuantity: 182, issuePrice: 82, refundAmount: 0, currentPrice: 100.5, currentPriceAt: '2026-11-06T10:00:00Z', currentPriceSource: 'SCREENSHOT' })
  const props = { onClose: noop, onEdit: noop, onDelete: noop, onAdvance: noop, onImport: noop, onPrice: async () => undefined }
  it('shows the price with its timestamp and source, and the price form for listed IPOs', () => {
    const html = renderToStaticMarkup(<IpoDetail ipo={listed} {...props}/>)
    expect(html).toContain('Price as of')
    expect(html).toContain('screenshot')
    expect(html).toContain('Update current price')
    expect(html).toContain('No live market-data feed is connected')
  })
  it('offers only valid next statuses for an application', () => {
    const html = renderToStaticMarkup(<IpoDetail ipo={mk()} {...props}/>)
    expect(html).toContain('Mark allotted')
    expect(html).toContain('Mark partially allotted')
    expect(html).toContain('Mark not allotted')
    expect(html).not.toContain('Mark listed')
    expect(html).not.toContain('Update current price')
  })
  it('offers no transitions once listed', () => {
    expect(renderToStaticMarkup(<IpoDetail ipo={listed} {...props}/>)).not.toContain('Mark ')
  })
  it('never shows a price for an unlisted IPO', () => {
    const html = renderToStaticMarkup(<IpoDetail ipo={mk({ status: 'ALLOTTED', allottedQuantity: 182, issuePrice: 82 })} {...props}/>)
    expect(html).toMatch(/Current price<\/small><b>—</)
  })
})

describe('IpoImportModal and small pieces', () => {
  it('requires review before saving and explains OCR is preserved', () => {
    const html = renderToStaticMarkup(<IpoImportModal ipos={[]} target={null} onClose={noop} onSaved={noop}/>)
    expect(html).toContain('Nothing is saved until you review')
    expect(html).toContain('Application confirmation')
    expect(html).toMatch(/Confirm &amp; save<\/button>/)
    expect(html).toMatch(/disabled=""[^>]*><svg[^>]*><path d="M20 6 9 17l-5-5"/) // confirm disabled before a screenshot is read
  })
  it('labels the target IPO when updating from a saved record', () => {
    expect(renderToStaticMarkup(<IpoImportModal ipos={[mk()]} target={mk()} onClose={noop} onSaved={noop}/>)).toContain('Update Bombay Coated and Special Steels Limited')
  })
  it('marks the selected trade type for assistive tech', () => {
    const html = renderToStaticMarkup(<TradeTypeSwitch value="IPO" onChange={noop}/>)
    expect(html).toMatch(/aria-selected="true" class="active">IPO/)
    expect(html).toMatch(/aria-selected="false" class="">Crypto|aria-selected="false">Crypto/)
  })
  it.each([['APPLIED', 'Applied'], ['ALLOTTED', 'Allotted'], ['PARTIALLY_ALLOTTED', 'Partially allotted'], ['NOT_ALLOTTED', 'Not allotted'], ['LISTED', 'Listed']] as const)('badge %s', (status, label) => {
    expect(renderToStaticMarkup(<IpoStatusBadge status={status}/>)).toContain(`>${label}<`)
  })
})
