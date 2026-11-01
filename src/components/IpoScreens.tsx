import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, CalendarDays, Check, CloudUpload, Filter, Landmark, Plus, Search, SlidersHorizontal, Trash2, TrendingUp, Wallet, X, Clock3 } from 'lucide-react'
import { IPO_STATUSES, IPO_STATUS_LABELS, emptyIpoDraft, ipoToDraft, type IpoDraft, type IpoExtraction, type IpoExtractionKind, type IpoStatus, type IpoTrade } from '../types/ipo'
import { allowedNextStatuses, combinePortfolio, computeIpoFinancials, estimateIpoTimeline, getIpoAnalytics, getUpcomingEvents, validateIpoRecord, type CombinedPortfolio } from '../services/ipoCalculations'
import { extractionToIpoPatch, findMatchingIpo, parseIpoScreenshotText, reconcileAllotmentStatus, type IpoExtractionResult } from '../services/ipoOcrParser'
import { findIpoExtractionByHash, insertIpoTrade, listIpoExtractions, saveIpoExtraction, sha256Hex, updateIpoTrade } from '../services/ipoRepository'
import { tesseractOCRProvider } from '../services/screenshotExtractionService'
import { getInrToUsdRate } from '../services/exchangeRateService'
import { formatCurrencyUSD } from '../utils/currency'
import './ipo.css'

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------
const inrFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inr = (value: number | null | undefined): string => value == null || !Number.isFinite(value) ? '—' : inrFormat.format(value)
const pctText = (value: number | null | undefined): string => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
const dateText = (value: string | null | undefined): string => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const stampText = (value: string | null | undefined): string => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const toLocalInput = (iso: string | null): string => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const fromLocalInput = (value: string): string | null => { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString() }
const todayIso = (): string => new Date().toISOString().slice(0, 10)

function Money({ value, percent = false }: { value: number | null; percent?: boolean }) {
  if (value == null) return <span className="muted">—</span>
  return <span className={value > 0 ? 'positive' : value < 0 ? 'negative' : ''}>{percent ? pctText(value) : inr(value)}</span>
}
export function IpoStatusBadge({ status }: { status: IpoStatus }) { return <span className={`ipo-badge ipo-${status.toLowerCase()}`}>{IPO_STATUS_LABELS[status]}</span> }

// ---------------------------------------------------------------------------------------------
// Add-trade type selector
// ---------------------------------------------------------------------------------------------
export function TradeTypeSwitch({ value, onChange }: { value: 'CRYPTO' | 'IPO'; onChange: (next: 'CRYPTO' | 'IPO') => void }) {
  return <div className="trade-type-switch" role="tablist" aria-label="Trade type">
    {(['CRYPTO', 'IPO'] as const).map(type => <button key={type} type="button" role="tab" aria-selected={value === type} className={value === type ? 'active' : ''} onClick={() => onChange(type)}>{type === 'CRYPTO' ? 'Crypto' : 'IPO'}</button>)}
  </div>
}

// ---------------------------------------------------------------------------------------------
// IPO list / analytics page
// ---------------------------------------------------------------------------------------------
type SortKey = 'NEWEST' | 'CLOSING' | 'PNL'

export function IpoPage({ ipos, loadError, onAdd, onImport, onOpen, cryptoRealizedPnlUsd, cryptoOpenMarginUsd }: {
  ipos: IpoTrade[]; loadError: string | null; onAdd: () => void; onImport: () => void; onOpen: (ipo: IpoTrade) => void
  cryptoRealizedPnlUsd: number; cryptoOpenMarginUsd: number
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | IpoStatus>('ALL')
  const [sort, setSort] = useState<SortKey>('NEWEST')
  const [combined, setCombined] = useState<CombinedPortfolio | null>(null)
  const [combinedBusy, setCombinedBusy] = useState(false)

  const analytics = useMemo(() => getIpoAnalytics(ipos), [ipos])
  const upcoming = useMemo(() => getUpcomingEvents(ipos, todayIso()).slice(0, 5), [ipos])
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = ipos
      .filter(ipo => status === 'ALL' || ipo.status === status)
      .filter(ipo => !needle || [ipo.companyName, ipo.symbol, ipo.applicationNumber, ipo.exchange].some(value => value?.toLowerCase().includes(needle)))
      .map(ipo => ({ ipo, f: computeIpoFinancials(ipo) }))
    list.sort((a, b) => {
      if (sort === 'CLOSING') return (a.ipo.closeDate ?? '9999').localeCompare(b.ipo.closeDate ?? '9999')
      if (sort === 'PNL') return (b.f.totalPnl ?? -Infinity) - (a.f.totalPnl ?? -Infinity)
      return b.ipo.createdAt.localeCompare(a.ipo.createdAt)
    })
    return list
  }, [ipos, query, status, sort])

  async function showCombined() {
    setCombinedBusy(true)
    let fx: { rate: number; date: string } | null = null
    try { fx = await getInrToUsdRate() } catch { fx = null }
    setCombined(combinePortfolio({ cryptoRealizedPnlUsd, cryptoOpenMarginUsd, ipo: analytics, fx }))
    setCombinedBusy(false)
  }

  const c = analytics.counts
  return <>
    <div className="page-heading"><div><div className="eyebrow">IPO JOURNAL</div><h1>IPOs</h1><p>Applications, allotments, refunds and listed positions — tracked separately from crypto trades.</p></div>
      <div className="heading-action"><button type="button" className="button button-secondary" onClick={onImport}><CloudUpload size={15}/> Upload screenshot</button><button type="button" className="button button-primary" onClick={onAdd}><Plus size={16}/> Add IPO</button></div></div>

    {loadError && <div className="ipo-alert" role="alert"><AlertTriangle size={16}/><span><b>IPO data could not be loaded.</b> {loadError} If this is a new setup, apply database migration <code>012_ipo_tracking.sql</code> in Supabase, then reload.</span></div>}

    <div className="stats-grid ipo-stats">
      <IpoStat label="Applications" value={String(analytics.total)} icon={Landmark} detail={`${c.APPLIED} applied · ${c.ALLOTTED + c.PARTIALLY_ALLOTTED} allotted · ${c.NOT_ALLOTTED} not allotted · ${c.LISTED} listed`}/>
      <IpoStat label="Funds blocked now" value={inr(analytics.fundsBlockedNow)} icon={Clock3} detail={analytics.blockedUnknownCount ? `${analytics.blockedUnknownCount} application(s) have no blocked amount recorded` : 'Applied IPOs awaiting allotment'}/>
      <IpoStat label="Invested capital" value={inr(analytics.investedCapital)} icon={Wallet} detail={analytics.investedUnknownCount ? `${analytics.investedUnknownCount} allotment(s) missing cost — not included` : 'Actual allotted cost, not application amount'}/>
      <IpoStat label="Refunds" value={inr(analytics.refundsReceived)} icon={ArrowUpRight} detail="Recorded or derived from blocked − invested"/>
      <IpoStat label="Current value" value={analytics.valuedCount ? inr(analytics.currentValue) : '—'} icon={TrendingUp} detail={analytics.valuedCount ? `${analytics.valuedCount} listed position(s) with a price` : 'Add a listed price to see value'}/>
      <IpoStat label="Total P&L" value={analytics.pnlCostBasis > 0 ? inr(analytics.totalPnl) : '—'} icon={TrendingUp} detail={analytics.returnPct != null ? `Return ${pctText(analytics.returnPct)} · realized ${inr(analytics.realizedPnl)}` : 'Needs a listed price or an exit'} tone={analytics.totalPnl}/>
    </div>

    <div className="ipo-grid">
      <section className="panel"><div className="panel-head"><div><h2>Upcoming</h2><p>Allotment and listing dates. Estimates exclude exchange holidays.</p></div><CalendarDays size={16}/></div>
        {upcoming.length === 0 ? <div className="empty-state compact"><span>No upcoming allotment or listing dates. Add a close date to see estimates.</span></div>
          : <ul className="ipo-upcoming">{upcoming.map(event => <li key={`${event.ipoId}-${event.event}`}><b>{event.companyName}</b><span>{event.event === 'ALLOTMENT' ? 'Allotment' : 'Listing'} · {dateText(event.date)}</span><small className={event.basis === 'ESTIMATE' ? 'estimate' : ''}>{event.basis === 'ESTIMATE' ? 'Estimate' : 'Recorded'}</small></li>)}</ul>}
      </section>
      <section className="panel"><div className="panel-head"><div><h2>Combined portfolio</h2><p>Crypto (USD) + IPO (₹ converted). Blocked funds are counted once.</p></div></div>
        {!combined && <button type="button" className="button button-secondary" onClick={() => { void showCombined() }} disabled={combinedBusy}>{combinedBusy ? 'Fetching exchange rate…' : 'Show combined totals'}</button>}
        {combined && !combined.available && <p className="ipo-note">{combined.reason}</p>}
        {combined?.available && <div className="detail-fields ipo-combined">
          <div><small>Realized P&L (crypto + IPO)</small><b><Money value={combined.realizedPnlUsd}/></b></div>
          <div><small>Unrealized IPO P&L</small><b>{formatCurrencyUSD(combined.unrealizedIpoPnlUsd)}</b></div>
          <div><small>Capital committed</small><b>{formatCurrencyUSD(combined.capitalCommittedUsd)}</b></div>
          <div><small>IPO capital (₹)</small><b>{inr(combined.ipoCapitalCommittedInr)}</b></div>
          <div className="span-two"><small>Rate used</small><b>₹1 = {formatCurrencyUSD(combined.rate)} on {combined.rateDate}</b></div>
          {combined.capitalIncomplete && <div className="span-two ipo-note">Some IPO records lack a blocked amount or cost, so committed capital may be understated.</div>}
        </div>}
      </section>
    </div>

    <section className="panel">
      <div className="table-toolbar">
        <div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search company, symbol, application no."/></div>
        <label className="filter-select"><Filter size={14}/><select value={status} onChange={event => setStatus(event.target.value as 'ALL' | IpoStatus)}><option value="ALL">All statuses</option>{IPO_STATUSES.map(s => <option key={s} value={s}>{IPO_STATUS_LABELS[s]}</option>)}</select></label>
        <label className="filter-select"><select value={sort} onChange={event => setSort(event.target.value as SortKey)}><option value="NEWEST">Newest first</option><option value="CLOSING">Closing soonest</option><option value="PNL">Highest P&L</option></select></label>
      </div>
      {rows.length === 0 ? <div className="empty-state"><Landmark size={22}/><b>{ipos.length === 0 ? 'No IPOs yet' : 'No IPOs match these filters'}</b><span>{ipos.length === 0 ? 'Add an IPO manually or upload your application confirmation screenshot.' : 'Clear the search or choose another status.'}</span></div> : <>
        <div className="table-wrap ipo-table-desktop"><table><thead><tr><th>COMPANY</th><th>STATUS</th><th>APPLIED</th><th>BLOCKED</th><th>ALLOTTED</th><th>INVESTED</th><th>REFUND</th><th>VALUE</th><th>P&L</th><th>RETURN</th><th>KEY DATES</th></tr></thead><tbody>
          {rows.map(({ ipo, f }) => <tr key={ipo.id} className="click-row" onClick={() => onOpen(ipo)}>
            <td><div className="asset-cell"><span className="asset-logo">{ipo.companyName.slice(0, 1)}</span><span><b>{ipo.companyName}</b><small>{ipo.symbol ?? ipo.applicationNumber ?? 'No ticker yet'}</small></span></div></td>
            <td><IpoStatusBadge status={ipo.status}/></td>
            <td>{f.quantity != null ? `${f.quantity} × ${inr(ipo.appliedPrice)}` : '—'}<small className="sub">{inr(f.applicationAmount)}</small></td>
            <td>{inr(f.fundsCurrentlyBlocked)}</td>
            <td>{f.allottedQuantity ?? '—'}</td>
            <td>{inr(f.allottedInvestment)}</td><td>{inr(f.refund)}</td><td>{inr(f.currentValue)}</td>
            <td><Money value={f.totalPnl}/></td><td><Money value={f.totalReturnPct} percent/></td>
            <td className="ipo-dates">Close {dateText(ipo.closeDate)}<small className="sub">Allot {dateText(ipo.allotmentDate)} · List {dateText(ipo.listingDate)}</small></td>
          </tr>)}</tbody></table></div>
        <div className="ipo-card-list">{rows.map(({ ipo, f }) => <article className="trade-mobile-card" key={ipo.id} role="button" tabIndex={0} onClick={() => onOpen(ipo)} onKeyDown={event => event.key === 'Enter' && onOpen(ipo)}>
          <header><span className="asset-logo">{ipo.companyName.slice(0, 1)}</span><span className="trade-card-title"><b>{ipo.companyName}</b><small>{ipo.symbol ?? ipo.applicationNumber ?? 'No ticker yet'}</small></span><IpoStatusBadge status={ipo.status}/></header>
          <div className="trade-card-fields">{([['Applied', f.quantity != null ? `${f.quantity} × ${inr(ipo.appliedPrice)}` : '—'], ['Blocked', inr(f.fundsCurrentlyBlocked)], ['Allotted', String(f.allottedQuantity ?? '—')], ['Invested', inr(f.allottedInvestment)], ['Refund', inr(f.refund)], ['Value', inr(f.currentValue)], ['P&L', <Money key="p" value={f.totalPnl}/>], ['Return', <Money key="r" value={f.totalReturnPct} percent/>], ['Closes', dateText(ipo.closeDate)], ['Listing', dateText(ipo.listingDate)]] as [string, React.ReactNode][]).map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
        </article>)}</div></>}
    </section>
  </>
}

function IpoStat({ label, value, icon: Icon, detail, tone }: { label: string; value: string; icon: typeof Wallet; detail: string; tone?: number }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={16}/></span></div><strong className={`stat-value ${tone != null && tone > 0 ? 'positive' : tone != null && tone < 0 ? 'negative' : ''}`}>{value}</strong><div className="stat-foot"><span>{detail}</span></div></div>
}

// ---------------------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------------------
export function IpoEditor({ ipo, initial, onClose, onSave, working, typeSwitch }: {
  ipo: IpoTrade | null; initial?: Partial<IpoDraft>; onClose: () => void; onSave: (draft: IpoDraft, existing?: IpoTrade) => Promise<void>; working: boolean; typeSwitch?: React.ReactNode
}) {
  const [form, setForm] = useState<IpoDraft>(() => ({ ...ipoToDraft(ipo), ...initial }))
  const patch = <K extends keyof IpoDraft>(key: K, value: IpoDraft[K]) => setForm(current => ({ ...current, [key]: value }))
  const validation = useMemo(() => validateIpoRecord(form), [form])
  const f = useMemo(() => computeIpoFinancials(form), [form])
  const estimate = useMemo(() => estimateIpoTimeline(form.closeDate), [form.closeDate])
  const allotted = form.status !== 'APPLIED'
  const listed = form.status === 'LISTED'

  const text = (key: 'companyName' | 'symbol' | 'exchange' | 'applicationNumber' | 'dpId' | 'clientId' | 'holdAccountMasked', label: string, span = false, required = false) =>
    <label className={span ? 'span-two' : ''}>{label}<input required={required} value={form[key] ?? ''} onChange={event => patch(key, (event.target.value || null) as IpoDraft[typeof key])}/></label>
  const number = (key: 'priceBandLow' | 'priceBandHigh' | 'cutoffPrice' | 'appliedPrice' | 'issuePrice' | 'lotSize' | 'lots' | 'quantity' | 'applicationAmount' | 'blockedAmount' | 'allottedQuantity' | 'refundAmount' | 'listingPrice' | 'exitPrice' | 'exitQuantity' | 'exitCharges', label: string, step = 'any') =>
    <label>{label}<input type="number" step={step} min="0" value={form[key] ?? ''} onChange={event => patch(key, (event.target.value === '' ? null : Number(event.target.value)) as IpoDraft[typeof key])}/></label>
  const date = (key: 'openDate' | 'closeDate' | 'allotmentDate' | 'listingDate' | 'exitDate', label: string) =>
    <label>{label}<input type="date" value={form[key] ?? ''} onChange={event => patch(key, event.target.value || null)}/></label>

  function setPrice(value: number | null) {
    setForm(current => value == null
      ? { ...current, currentPrice: null, currentPriceAt: null, currentPriceSource: null }
      : { ...current, currentPrice: value, currentPriceAt: current.currentPriceAt ?? new Date().toISOString(), currentPriceSource: current.currentPriceSource ?? 'MANUAL' })
  }
  function setStatus(next: IpoStatus) { setForm(current => ({ ...current, status: next })) }
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (validation.errors.length === 0) void onSave({ ...form, companyName: form.companyName.trim() }, ipo ?? undefined) }

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="trade-modal ipo-modal" onSubmit={submit}>
    <div className="modal-head"><div><div className="eyebrow">IPO APPLICATION</div><h2>{ipo ? 'Edit IPO' : 'Add IPO'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
    {typeSwitch}
    <h3 className="detail-section-title">Issue details</h3>
    <div className="form-grid">
      {text('companyName', 'Company name', true, true)}{text('symbol', 'Ticker (after listing)')}{text('exchange', 'Exchange (NSE / BSE)')}
      <label>Type<select value={form.ipoType ?? ''} onChange={event => patch('ipoType', (event.target.value || null) as IpoDraft['ipoType'])}><option value="">Unset</option><option value="MAINBOARD">Mainboard</option><option value="SME">SME</option></select></label>
      {date('openDate', 'Issue opens')}{date('closeDate', 'Issue closes')}
      {number('priceBandLow', 'Price band — low (₹)')}{number('priceBandHigh', 'Price band — high (₹)')}{number('cutoffPrice', 'Cut-off price (₹)')}
      {number('lotSize', 'Lot size (shares)', '1')}
    </div>
    <h3 className="detail-section-title">Your application</h3>
    <div className="form-grid">
      <label>Mandate<select value={form.mandateType ?? ''} onChange={event => patch('mandateType', (event.target.value || null) as IpoDraft['mandateType'])}><option value="">Unset</option><option value="ASBA">ASBA</option><option value="UPI">UPI</option></select></label>
      <label>Bid type<select value={form.bidType ?? ''} onChange={event => patch('bidType', (event.target.value || null) as IpoDraft['bidType'])}><option value="">Unset</option><option value="CUTOFF">Cut-off</option><option value="LIMIT">Limit price</option></select></label>
      {text('applicationNumber', 'Application number')}
      {number('appliedPrice', 'Applied price (₹)')}{number('lots', 'Number of lots', '1')}{number('quantity', 'Quantity (shares)', '1')}
      {number('applicationAmount', 'Application amount (₹)')}{number('blockedAmount', 'Amount blocked / held (₹)')}
      {text('dpId', 'DP ID')}{text('clientId', 'Client ID')}{text('holdAccountMasked', 'Hold account (masked)')}
    </div>
    <h3 className="detail-section-title">Outcome</h3>
    <div className="form-grid">
      <label>Status<select value={form.status} onChange={event => setStatus(event.target.value as IpoStatus)}>{IPO_STATUSES.map(s => <option key={s} value={s}>{IPO_STATUS_LABELS[s]}</option>)}</select></label>
      {allotted && <>{number('allottedQuantity', 'Allotted shares', '1')}{number('issuePrice', 'Issue price allotted at (₹)')}{number('refundAmount', 'Refund amount (₹)')}{date('allotmentDate', 'Allotment date')}{date('listingDate', 'Listing date')}</>}
      {listed && number('listingPrice', 'Listing price (₹)')}
    </div>
    {estimate && (!form.allotmentDate || !form.listingDate) && <p className="ipo-note">Estimated from the close date (T+3, no holidays): allotment {dateText(estimate.allotmentDate)}, listing {dateText(estimate.listingDate)}. <button type="button" className="text-button" onClick={() => setForm(current => ({ ...current, allotmentDate: current.allotmentDate ?? estimate.allotmentDate, listingDate: current.listingDate ?? estimate.listingDate }))}>Use estimates</button> (you can overwrite them with the real dates).</p>}
    {listed && <><h3 className="detail-section-title">Price &amp; exit</h3><div className="form-grid">
      <label>Current price (₹)<input type="number" step="any" min="0" value={form.currentPrice ?? ''} onChange={event => setPrice(event.target.value === '' ? null : Number(event.target.value))}/></label>
      <label>Price as of<input type="datetime-local" value={toLocalInput(form.currentPriceAt)} disabled={form.currentPrice == null} onChange={event => patch('currentPriceAt', fromLocalInput(event.target.value))}/></label>
      {number('exitQuantity', 'Sold quantity', '1')}{number('exitPrice', 'Sell price (₹)')}{number('exitCharges', 'Sale charges (₹)')}{date('exitDate', 'Sell date')}
    </div></>}
    <label className="span-two ipo-notes">Notes<textarea rows={2} value={form.notes ?? ''} onChange={event => patch('notes', event.target.value || null)}/></label>

    <div className="ipo-preview"><h3 className="detail-section-title">Calculated from what you entered</h3><div className="detail-fields">
      <div><small>Application amount</small><b>{inr(f.applicationAmount)}</b></div><div><small>Funds blocked now</small><b>{inr(f.fundsCurrentlyBlocked)}</b></div>
      <div><small>Allotted investment</small><b>{inr(f.allottedInvestment)}</b></div><div><small>Refund</small><b>{inr(f.refund)}{f.refundSource === 'derived' ? ' (derived)' : ''}</b></div>
      <div><small>Cost per share</small><b>{inr(f.costPerShare)}</b></div><div><small>Unrealized P&L</small><b><Money value={f.unrealizedPnl}/></b></div>
      <div><small>Realized P&L</small><b><Money value={f.realizedPnl}/></b></div><div><small>Total return</small><b><Money value={f.totalReturnPct} percent/></b></div>
    </div>{form.status === 'APPLIED' && <p className="ipo-note">Allotment is never assumed — investment and P&L appear only after you record the allotted shares.</p>}</div>

    {validation.errors.length > 0 && <ul className="ipo-issues error" role="alert">{validation.errors.map(message => <li key={message}>{message}</li>)}</ul>}
    {validation.warnings.length > 0 && <ul className="ipo-issues warning">{validation.warnings.map(message => <li key={message}>{message}</li>)}</ul>}
    <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={working || validation.errors.length > 0}><Check size={15}/>{working ? 'Saving…' : 'Save IPO'}</button></div>
  </form></div>
}

// ---------------------------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------------------------
export function IpoDetail({ ipo, onClose, onEdit, onDelete, onAdvance, onImport, onPrice }: {
  ipo: IpoTrade; onClose: () => void; onEdit: () => void; onDelete: () => void
  onAdvance: (status: IpoStatus) => void; onImport: () => void; onPrice: (price: number, at: string) => Promise<void>
}) {
  const f = useMemo(() => computeIpoFinancials(ipo), [ipo])
  const [extractions, setExtractions] = useState<IpoExtraction[]>([])
  const [price, setPrice] = useState(ipo.currentPrice?.toString() ?? '')
  const [priceAt, setPriceAt] = useState(() => toLocalInput(new Date().toISOString()))
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  useEffect(() => { let active = true; void listIpoExtractions(ipo.id).then(list => { if (active) setExtractions(list) }).catch(() => { if (active) setExtractions([]) }); return () => { active = false } }, [ipo.id])

  async function submitPrice(event: React.FormEvent) {
    event.preventDefault()
    const value = Number(price); const at = fromLocalInput(priceAt)
    if (!(value > 0) || !at) { setPriceError('Enter a price above zero and the time it was observed.'); return }
    setPriceBusy(true); setPriceError(null)
    try { await onPrice(value, at) } catch (cause) { setPriceError(cause instanceof Error ? cause.message : 'Could not save the price.') } finally { setPriceBusy(false) }
  }
  const next = allowedNextStatuses(ipo.status)
  const fields: [string, React.ReactNode][] = [
    ['Application no.', ipo.applicationNumber ?? '—'], ['Mandate', ipo.mandateType ?? '—'], ['Exchange / ticker', [ipo.exchange, ipo.symbol].filter(Boolean).join(' · ') || '—'],
    ['Price band', ipo.priceBandLow != null || ipo.priceBandHigh != null ? `${inr(ipo.priceBandLow)} – ${inr(ipo.priceBandHigh)}` : '—'], ['Applied price', inr(ipo.appliedPrice)], ['Issue price', inr(ipo.issuePrice)],
    ['Lot size × lots', ipo.lotSize != null || ipo.lots != null ? `${ipo.lotSize ?? '?'} × ${ipo.lots ?? '?'}` : '—'], ['Quantity applied', f.quantity != null ? `${f.quantity}${f.quantitySource === 'lots_x_lot_size' ? ' (lots × lot size)' : ''}` : '—'],
    ['Application amount', inr(f.applicationAmount)], ['Amount blocked', inr(ipo.blockedAmount)], ['Funds blocked now', inr(f.fundsCurrentlyBlocked)],
    ['Allotted shares', f.allottedQuantity != null ? String(f.allottedQuantity) : '—'], ['Allotted investment', inr(f.allottedInvestment)], ['Refund', f.refund != null ? `${inr(f.refund)}${f.refundSource === 'derived' ? ' (derived)' : ''}` : '—'],
    ['Cost per share', inr(f.costPerShare)], ['Listing price', inr(ipo.listingPrice)], ['Listing gain', f.listingGain != null ? inr(f.listingGain) : '—'],
    ['Current price', ipo.currentPrice != null ? inr(ipo.currentPrice) : '—'], ['Price as of', ipo.currentPrice != null ? `${stampText(ipo.currentPriceAt)} · ${ipo.currentPriceSource?.toLowerCase()}` : '—'], ['Current value', inr(f.currentValue)],
    ['Unrealized P&L', <Money key="u" value={f.unrealizedPnl}/>], ['Realized P&L', <Money key="r" value={f.realizedPnl}/>], ['Total return', <Money key="t" value={f.totalReturnPct} percent/>],
    ['Opens', dateText(ipo.openDate)], ['Closes', dateText(ipo.closeDate)], ['Allotment', dateText(ipo.allotmentDate)], ['Listing', dateText(ipo.listingDate)],
  ]
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="trade-modal detail-modal ipo-modal">
    <div className="modal-head"><div><div className="eyebrow">IPO DETAIL</div><h2>{ipo.companyName}</h2><IpoStatusBadge status={ipo.status}/></div><div className="heading-action"><button type="button" className="button button-secondary" onClick={onEdit}><SlidersHorizontal size={14}/>Edit</button><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div></div>
    <div className="ipo-actions">
      {next.map(status => <button key={status} type="button" className="button button-secondary" onClick={() => onAdvance(status)}>Mark {IPO_STATUS_LABELS[status].toLowerCase()}</button>)}
      <button type="button" className="button button-secondary" onClick={onImport}><CloudUpload size={14}/>Update from screenshot</button>
    </div>
    <div className="detail-fields">{fields.map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
    {f.realizedExcludesCharges && <p className="ipo-note">Realized P&L excludes sale charges because none were entered.</p>}
    {ipo.status === 'LISTED' && <form className="ipo-price-form" onSubmit={event => { void submitPrice(event) }}>
      <h3 className="detail-section-title">Update current price</h3>
      <div className="form-grid"><label>Price (₹)<input type="number" step="any" min="0" value={price} onChange={event => setPrice(event.target.value)}/></label><label>Observed at<input type="datetime-local" value={priceAt} onChange={event => setPriceAt(event.target.value)}/></label></div>
      <p className="ipo-note">No live market-data feed is connected, so prices come only from what you enter or upload and always carry their timestamp.</p>
      {priceError && <ul className="ipo-issues error"><li>{priceError}</li></ul>}
      <button className="button button-primary" type="submit" disabled={priceBusy}>{priceBusy ? 'Saving…' : 'Save price'}</button>
    </form>}
    {ipo.notes && <><h3 className="detail-section-title">Notes</h3><p className="ipo-note">{ipo.notes}</p></>}
    <h3 className="detail-section-title">Imported screenshots</h3>
    {extractions.length === 0 ? <p className="ipo-note">No screenshots imported for this IPO yet.</p> : <div className="ipo-extractions">{extractions.map(item => <details key={item.id}><summary>{item.kind.toLowerCase()} · {stampText(item.createdAt)} · {item.ocrConfidence != null ? `OCR ${Math.round(item.ocrConfidence * 100)}%` : 'OCR n/a'}{item.originalName ? ` · ${item.originalName}` : ''}</summary><pre>{item.rawText || '(no text)'}</pre></details>)}</div>}
    <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onDelete}><Trash2 size={14}/>Delete</button><button type="button" className="button button-primary" onClick={onClose}>Close</button></div>
  </div></div>
}

// ---------------------------------------------------------------------------------------------
// Screenshot import (OCR → review → confirm → save)
// ---------------------------------------------------------------------------------------------
type FieldDescriptor = { key: keyof IpoDraft; label: string; type: 'text' | 'number' | 'date' | 'status' | 'mandate'; hint?: string }
const FIELDS: Record<Exclude<IpoExtractionKind, 'UNKNOWN'>, FieldDescriptor[]> = {
  APPLICATION: [
    { key: 'companyName', label: 'Company name', type: 'text' }, { key: 'applicationNumber', label: 'Application number', type: 'text' }, { key: 'mandateType', label: 'Mandate', type: 'mandate' },
    { key: 'quantity', label: 'Quantity (shares)', type: 'number' }, { key: 'appliedPrice', label: 'Applied price (₹)', type: 'number' }, { key: 'applicationAmount', label: 'Application amount (₹)', type: 'number' },
    { key: 'blockedAmount', label: 'Amount blocked (₹)', type: 'number' }, { key: 'dpId', label: 'DP ID', type: 'text' }, { key: 'clientId', label: 'Client ID', type: 'text' }, { key: 'holdAccountMasked', label: 'Hold account', type: 'text' },
    { key: 'openDate', label: 'Issue opens', type: 'date', hint: 'Not in this screenshot' }, { key: 'closeDate', label: 'Issue closes', type: 'date', hint: 'Not in this screenshot' },
    { key: 'priceBandLow', label: 'Price band low (₹)', type: 'number', hint: 'Not in this screenshot' }, { key: 'priceBandHigh', label: 'Price band high (₹)', type: 'number', hint: 'Not in this screenshot' }, { key: 'lotSize', label: 'Lot size', type: 'number', hint: 'Not in this screenshot' },
  ],
  ALLOTMENT: [
    { key: 'status', label: 'Status', type: 'status' }, { key: 'allottedQuantity', label: 'Allotted shares', type: 'number' }, { key: 'issuePrice', label: 'Issue price (₹)', type: 'number' },
    { key: 'refundAmount', label: 'Refund amount (₹)', type: 'number' }, { key: 'allotmentDate', label: 'Allotment date', type: 'date' }, { key: 'listingDate', label: 'Listing date', type: 'date' },
  ],
  PRICE: [{ key: 'currentPrice', label: 'Current price (₹)', type: 'number' }, { key: 'currentPriceAt', label: 'Price as of', type: 'text' }, { key: 'listingPrice', label: 'Listing price (₹)', type: 'number', hint: 'Optional' }],
}

export function IpoImportModal({ ipos, target, onClose, onSaved }: { ipos: IpoTrade[]; target: IpoTrade | null; onClose: () => void; onSaved: (message: string) => Promise<void> | void }) {
  const [kind, setKind] = useState<'AUTO' | Exclude<IpoExtractionKind, 'UNKNOWN'>>('AUTO')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IpoExtractionResult | null>(null)
  const [values, setValues] = useState<Partial<IpoDraft>>({})
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString())
  const [hash, setHash] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState(false)
  const [linkId, setLinkId] = useState<string>(target?.id ?? '')

  const activeKind = result && result.kind !== 'UNKNOWN' ? result.kind : null
  const linked = ipos.find(item => item.id === linkId) ?? null

  async function run() {
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG or WEBP image.')
      if (file.size > 10 * 1024 * 1024) throw new Error('Screenshots must be 10 MB or smaller.')
      const ocr = await tesseractOCRProvider.extractText(file)
      const parsed = parseIpoScreenshotText(ocr.text, ocr.confidence ?? null, kind === 'AUTO' ? undefined : kind)
      const digest = await sha256Hex(file)
      setHash(digest)
      setDuplicate(parsed.kind !== 'UNKNOWN' ? Boolean(await findIpoExtractionByHash(digest, parsed.kind).catch(() => null)) : false)
      setResult(parsed)
      setValues(extractionToIpoPatch(parsed, { observedAt }))
      if (!linkId) { const match = findMatchingIpo(ipos, parsed.fields); if (match) setLinkId(match.id) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read the screenshot.') } finally { setBusy(false) }
  }

  const set = (key: keyof IpoDraft, value: unknown) => setValues(current => ({ ...current, [key]: value } as Partial<IpoDraft>))

  // What would be saved: update the linked IPO, or create a new application.
  const merged = useMemo<IpoDraft | null>(() => {
    if (!activeKind) return null
    const base: IpoDraft = linked ? ipoToDraft(linked) : emptyIpoDraft()
    const next: IpoDraft = { ...base }
    for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') (next as unknown as Record<string, unknown>)[key] = value
    if (activeKind === 'ALLOTMENT') {
      const reconciled = reconcileAllotmentStatus({ status: next.status, allottedQuantity: next.allottedQuantity ?? undefined }, next.quantity)
      if (reconciled.status) next.status = reconciled.status
    }
    if (activeKind === 'PRICE' && next.currentPrice != null) { next.currentPriceSource = 'SCREENSHOT'; next.currentPriceAt = typeof values.currentPriceAt === 'string' && values.currentPriceAt ? values.currentPriceAt : observedAt }
    return next
  }, [activeKind, linked, values, observedAt])

  const validation = useMemo(() => merged ? validateIpoRecord(merged) : { errors: [], warnings: [] }, [merged])
  const parserErrors = result?.issues.filter(issue => issue.severity === 'error') ?? []
  const needsTarget = activeKind !== null && activeKind !== 'APPLICATION' && !linked
  const blocked = !merged || needsTarget || duplicate || validation.errors.length > 0 || (activeKind === 'APPLICATION' && !linked && !merged.companyName.trim())

  async function confirmSave() {
    if (!merged || !result || !activeKind) return
    setBusy(true); setError(null)
    try {
      const saved = linked ? await updateIpoTrade(linked.id, merged) : await insertIpoTrade(merged)
      await saveIpoExtraction({ kind: activeKind, status: 'CONFIRMED', ipoTradeId: saved.id, originalName: file?.name ?? null, sha256: hash, rawText: result.rawText, ocrConfidence: result.ocrConfidence, parsed: { fields: result.fields, bids: result.bids, issues: result.issues }, confirmed: values as Record<string, unknown> })
      await onSaved(linked ? `Updated ${saved.companyName} from the ${activeKind.toLowerCase()} screenshot.` : `Added ${saved.companyName}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save.') } finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="trade-modal ipo-modal">
    <div className="modal-head"><div><div className="eyebrow">IPO SCREENSHOT</div><h2>{target ? `Update ${target.companyName}` : 'Import from screenshot'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
    <p className="ipo-note">Upload an application confirmation, allotment notice or stock-price screenshot. Nothing is saved until you review and confirm the values below.</p>
    <div className="form-grid">
      <label>Screenshot type<select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="AUTO">Detect automatically</option><option value="APPLICATION">Application confirmation</option><option value="ALLOTMENT">Allotment status</option><option value="PRICE">Stock price</option></select></label>
      <label>Image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { setFile(event.target.files?.[0] ?? null); setResult(null); setError(null) }}/></label>
    </div>
    <div className="ipo-actions"><button type="button" className="button button-primary" disabled={!file || busy} onClick={() => { void run() }}>{busy && !result ? 'Reading screenshot…' : 'Read screenshot'}</button></div>
    {error && <ul className="ipo-issues error" role="alert"><li>{error}</li></ul>}

    {result && <>
      <h3 className="detail-section-title">Review &amp; correct — {result.kind === 'UNKNOWN' ? 'not recognised' : result.kind.toLowerCase()}{result.ocrConfidence != null ? ` · OCR ${Math.round(result.ocrConfidence * 100)}%` : ''}</h3>
      {duplicate && <ul className="ipo-issues error"><li>This exact image was already imported as this type. Open the IPO to see it under “Imported screenshots”.</li></ul>}
      {result.issues.length > 0 && <ul className={`ipo-issues ${parserErrors.length ? 'error' : 'warning'}`}>{result.issues.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul>}
      {activeKind && <>
        {(activeKind !== 'APPLICATION' || linked || ipos.length > 0) && <label className="span-two ipo-link">{activeKind === 'APPLICATION' ? 'Update existing IPO (optional)' : 'Apply to IPO'}<select value={linkId} onChange={event => setLinkId(event.target.value)}><option value="">{activeKind === 'APPLICATION' ? 'Create a new IPO' : 'Choose an IPO…'}</option>{ipos.map(item => <option key={item.id} value={item.id}>{item.companyName}{item.applicationNumber ? ` · ${item.applicationNumber}` : ''}</option>)}</select></label>}
        {needsTarget && <ul className="ipo-issues warning"><li>No saved IPO matched this screenshot. Choose which IPO it belongs to.</li></ul>}
        <div className="form-grid">{FIELDS[activeKind].map(field => <ReviewField key={field.key} field={field} value={values[field.key]} provenance={result.provenance[field.key as keyof typeof result.provenance]} onChange={value => set(field.key, value)}/>)}</div>
        {activeKind === 'PRICE' && <label>Price as of (used if the screenshot shows no time)<input type="datetime-local" value={toLocalInput(typeof values.currentPriceAt === 'string' && values.currentPriceAt ? values.currentPriceAt : observedAt)} onChange={event => { const iso = fromLocalInput(event.target.value); setObservedAt(iso ?? observedAt); set('currentPriceAt', iso) }}/></label>}
        {activeKind === 'ALLOTMENT' && merged && <p className="ipo-note">Status after saving: <IpoStatusBadge status={merged.status}/> {linked && merged.status === 'LISTED' ? '' : 'Status is reconciled with the shares you applied for.'}</p>}
        {validation.errors.length > 0 && <ul className="ipo-issues error">{validation.errors.map(message => <li key={message}>{message}</li>)}</ul>}
        {validation.warnings.length > 0 && <ul className="ipo-issues warning">{validation.warnings.map(message => <li key={message}>{message}</li>)}</ul>}
      </>}
      <details className="ipo-raw"><summary>Raw OCR text (preserved for debugging)</summary><pre>{result.rawText || '(empty)'}</pre></details>
    </>}
    <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={blocked || busy} onClick={() => { void confirmSave() }}><Check size={15}/>{busy && result ? 'Saving…' : linked ? 'Confirm & update' : 'Confirm & save'}</button></div>
  </div></div>
}

function ReviewField({ field, value, provenance, onChange }: { field: FieldDescriptor; value: unknown; provenance?: { source: string; requiresConfirmation?: boolean }; onChange: (value: unknown) => void }) {
  const flag = provenance?.requiresConfirmation ? 'confirm' : provenance?.source === 'calculated' ? 'calculated' : provenance ? 'ocr' : field.hint ? 'manual' : 'empty'
  const label = <span>{field.label}{flag === 'confirm' && <em className="ipo-flag warn"> · confirm</em>}{flag === 'calculated' && <em className="ipo-flag warn"> · calculated</em>}{flag === 'ocr' && <em className="ipo-flag ok"> · read</em>}{flag === 'manual' && <em className="ipo-flag"> · {field.hint}</em>}</span>
  if (field.type === 'status') return <label>{label}<select value={(value as string) ?? ''} onChange={event => onChange(event.target.value || undefined)}><option value="">Not detected</option>{IPO_STATUSES.filter(s => s !== 'APPLIED').map(s => <option key={s} value={s}>{IPO_STATUS_LABELS[s]}</option>)}</select></label>
  if (field.type === 'mandate') return <label>{label}<select value={(value as string) ?? ''} onChange={event => onChange(event.target.value || undefined)}><option value="">Unset</option><option value="ASBA">ASBA</option><option value="UPI">UPI</option></select></label>
  if (field.type === 'number') return <label>{label}<input type="number" step="any" min="0" value={(value as number | undefined) ?? ''} onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}/></label>
  if (field.type === 'date') return <label>{label}<input type="date" value={(value as string) ?? ''} onChange={event => onChange(event.target.value || undefined)}/></label>
  if (field.key === 'currentPriceAt') return <label>{label}<input readOnly value={typeof value === 'string' ? stampText(value) : 'Set below'}/></label>
  return <label>{label}<input value={(value as string) ?? ''} onChange={event => onChange(event.target.value || undefined)}/></label>
}
