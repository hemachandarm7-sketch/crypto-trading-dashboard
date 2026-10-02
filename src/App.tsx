import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bitcoin, CalendarDays, Camera, Check, ChevronDown, CircleHelp, Clock3, CloudUpload, FileImage, Filter, LayoutDashboard, Menu, MoreHorizontal, Plus, Search, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, TrendingUp, Upload, Wallet, X } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildCloseReasonPerformance, buildCoinPerformance, buildDirectionPerformance, buildEquityCurve, buildPnlBuckets, getAnalytics, getRealizedPnl } from './services/analytics'
import { confirmManualExtraction, processScreenshot } from './services/screenshotExtractionService'
import { associateScreenshot, defaultUserSettings, deleteScreenshot, downloadScreenshotFile, insertTrade, listTradeEvents, recordTradeEvent, removeTrade, saveUserSettings, updateTrade, uploadScreenshot } from './services/tradeRepository'
import { mapExtractionToForm } from './services/extractionFormMapper'
import './extraction-debug.css'
import type { TradeDraft } from './services/tradeRepository'
import { getTradeHoldingSeconds, formatDuration } from './services/tradeLifecycle'
import { supabaseConfigured } from './services/supabaseClient'
import { useSupabaseWorkspace } from './hooks/useSupabaseWorkspace'
import type { CloseReason, Direction, ExtractedTradeData, Screenshot, ScreenshotType, Trade, UserSettings } from './types'
import { formatCurrencyUSD } from './utils/currency'
import { linkWorkspaceEmail, sendWorkspaceSignIn } from './services/supabaseClient'

type Page = 'Dashboard' | 'Trades' | 'Open Positions' | 'Upload Screenshot' | 'Analytics' | 'Settings'
const navigation: { page: Page; icon: typeof LayoutDashboard }[] = [
  { page: 'Dashboard', icon: LayoutDashboard }, { page: 'Trades', icon: BarChart3 }, { page: 'Open Positions', icon: Activity },
  { page: 'Upload Screenshot', icon: CloudUpload }, { page: 'Analytics', icon: TrendingUp }, { page: 'Settings', icon: SettingsIcon },
]
const mobileNavigation = navigation.filter(({ page }) => ['Dashboard', 'Trades', 'Upload Screenshot', 'Analytics', 'Settings'].includes(page))
const usd = (value: number | null | undefined, currency = 'USD') => formatCurrencyUSD(value, currency)
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
const localDate = (value?: string | null) => value ? new Date(value).toLocaleString() : '—'
const draftFromTrade = (trade?: Trade): TradeDraft => trade ? {
  symbol: trade.symbol, exchange: trade.exchange, marketType: trade.marketType, direction: trade.direction, leverage: trade.leverage,
  quantity: trade.quantity, size: trade.size, margin: trade.margin, avgEntry: trade.avgEntry, ltp: trade.ltp,
  liquidationPrice: trade.liquidationPrice, takeProfit: trade.takeProfit, stopLoss: trade.stopLoss, openTime: trade.openTime,
  closeTime: trade.closeTime, holdingDurationSeconds: trade.holdingDurationSeconds, holdingDurationDisplay: trade.holdingDurationDisplay,
  closePrice: trade.closePrice, pnlAmount: trade.pnlAmount, pnlPercentage: trade.pnlPercentage, status: trade.status,
  closeReason: trade.closeReason, setup: trade.setup, notes: trade.notes, exchangePositionId: trade.exchangePositionId,
  openTransactionId: trade.openTransactionId, closeTransactionId: trade.closeTransactionId,
} : {
  symbol: '', exchange: defaultUserSettings.defaultExchange, marketType: defaultUserSettings.defaultMarket, direction: 'LONG', leverage: 3,
  quantity: null, size: null, margin: null, avgEntry: null, ltp: null, liquidationPrice: null, takeProfit: null, stopLoss: null,
  openTime: null, closeTime: null, holdingDurationSeconds: null, holdingDurationDisplay: null, closePrice: null, pnlAmount: null,
  pnlPercentage: null, status: 'OPEN', closeReason: null, setup: null, notes: null, exchangePositionId: null,
  openTransactionId: null, closeTransactionId: null,
}

export default function App() {
  const workspace = useSupabaseWorkspace()
  const { trades, screenshots, settings, loading, error, setError, refresh, setSettings, identity } = workspace
  const [page, setPage] = useState<Page>('Dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [tradeForm, setTradeForm] = useState<Trade | null | 'new'>(null)
  const [detailTrade, setDetailTrade] = useState<Trade | null>(null)
  const [reviewScreenshot, setReviewScreenshot] = useState<Screenshot | null>(null)
  const [now, setNow] = useState(Date.now())
  const [query, setQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterDirection, setFilterDirection] = useState('ALL')
  const [filterExchange, setFilterExchange] = useState('ALL')
  const [analyticsRange, setAnalyticsRange] = useState('All Time')
  const [dragging, setDragging] = useState(false)
  const [working, setWorking] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const previousPage = useRef(page)

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { document.documentElement.dataset.theme = settings.theme }, [settings.theme])
  useEffect(() => {
    if (previousPage.current !== page) {
      previousPage.current = page
      void refresh()
    }
  }, [page, refresh])

  const stats = useMemo(() => getAnalytics(trades), [trades])
  const positions = useMemo(() => trades.filter(trade => trade.status === 'OPEN'), [trades])
  useEffect(() => {
    if (import.meta.env.DEV) console.debug('[DASHBOARD METRICS]', { totalTrades: stats.totalTrades, openTrades: stats.openTrades, closedTrades: stats.closedTrades, totalInvestment: stats.totalInvestment, realizedPnl: stats.totalPnl })
  }, [stats])
  const filteredTrades = useMemo(() => trades.filter(trade => {
    const matchesQuery = `${trade.symbol} ${trade.exchange ?? ''} ${trade.setup ?? ''}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (filterStatus === 'ALL' || trade.status === filterStatus) && (filterDirection === 'ALL' || trade.direction === filterDirection) && (filterExchange === 'ALL' || trade.exchange === filterExchange)
  }).sort((a, b) => (b.openTime ?? b.createdAt).localeCompare(a.openTime ?? a.createdAt)), [trades, query, filterStatus, filterDirection, filterExchange])

  const safeAction = async (action: () => Promise<void>) => {
    setWorking(true); setError(null); setSuccess(null)
    try { await action(); await refresh() }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The requested change could not be saved.'
      // A later lifecycle write (for example event history) can fail after the trade row committed.
      // Refresh so the UI reflects the database state while still showing the failed operation.
      try { await refresh() } catch { /* preserve the original write error */ }
      setError(message)
    }
    finally { setWorking(false) }
  }
  const saveTrade = async (draft: TradeDraft, existing?: Trade) => safeAction(async () => {
    let saved: Trade
    if (existing) saved = await updateTrade(existing.id, draft)
    else saved = await insertTrade(draft)
    await recordTradeEvent({
      tradeId: saved.id, eventType: saved.status === 'CLOSED' ? 'CLOSE' : 'POSITION_DETAILS',
      eventTime: saved.closeTime ?? saved.openTime ?? undefined, price: saved.closePrice ?? saved.avgEntry ?? undefined,
      percentage: saved.pnlPercentage ?? undefined, rawData: { source: 'manual-editor', trade: draft },
    })
    setTradeForm(null)
  })
  const deleteTrade = async (trade: Trade) => {
    if (!window.confirm(`Delete ${trade.symbol} trade? Its screenshots will be unlinked and its event history will be removed.`)) return
    await safeAction(async () => { await removeTrade(trade.id); setDetailTrade(null) })
  }
  const uploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files)
    if (!selected.length) return
    for (const file of selected) {
      await safeAction(async () => {
        const result = await uploadScreenshot(file)
        if (result.duplicate) {
          const canRetry = result.screenshot.extractionStatus === 'FAILED'
            || result.screenshot.extractionStatus === 'UPLOADED'
            || result.screenshot.screenshotType === 'UNKNOWN'
          if (!canRetry) { setError('Already processed: ' + file.name); return }
        }
        await refresh()
        try {
          const data = await processScreenshot(result.screenshot, file, undefined, refresh)
          setReviewScreenshot({ ...result.screenshot, screenshotType: data.screenshotType, extractionStatus: 'EXTRACTED', extractionRawData: { ...data } })
        }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Screenshot extraction failed. You can enter the fields manually.') }
      })
    }
  }
  const retryScreenshot = async (screenshot: Screenshot) => safeAction(async () => {
    const file = await downloadScreenshotFile(screenshot)
    const data = await processScreenshot(screenshot, file, undefined, refresh)
    setReviewScreenshot({ ...screenshot, screenshotType: data.screenshotType, extractionStatus: 'EXTRACTED', extractionRawData: { ...data } })
  })
  const manualExtraction = async (screenshot: Screenshot, data: ExtractedTradeData, tradeId?: string) => {
    setWorking(true); setError(null); setSuccess(null)
    try {
      const savedTradeId = await confirmManualExtraction(screenshot, data, tradeId)
      await refresh()
      setReviewScreenshot(null)
      setSuccess(savedTradeId ? `Trade saved successfully (${data.symbol ?? 'trade'}).` : 'Screenshot saved. No matching trade was found, so no trade was created.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The extracted data could not be saved.'
      try { await refresh() } catch { /* preserve the original write error */ }
      setError(message)
    } finally { setWorking(false) }
  }
  const changeSettings = async (next: UserSettings) => {
    const fixedCurrency = { ...next, currency: 'USD' }
    setSettings(fixedCurrency)
    await safeAction(async () => { await saveUserSettings(fixedCurrency) })
  }
  const connectWorkspace = async (email: string) => safeAction(async () => {
    await sendWorkspaceSignIn(email)
    setSuccess(`Sign-in link sent to ${email}. Open it on this device to connect to the same workspace.`)
  })
  const linkCurrentWorkspace = async (email: string) => safeAction(async () => {
    await linkWorkspaceEmail(email)
    setSuccess(`Confirmation email sent to ${email}. Confirm it on this device first; this preserves the existing trades.`)
  })

  return <div className={`app-shell ${settings.theme === 'light' ? 'light' : ''}`}>
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Bitcoin size={21}/></span><span>orbit<span className="brand-dot">.</span><small>TRADING JOURNAL</small></span></div>
      <div className="workspace-label">WORKSPACE <button aria-label="Workspace options"><MoreHorizontal size={17}/></button></div>
      <nav>{navigation.map(({ page: item, icon: Icon }) => <button key={item} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => { setPage(item); setMobileNav(false) }}><Icon size={18}/><span>{item}</span>{item === 'Open Positions' && <b className="nav-count">{positions.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="plan-card"><div className="plan-icon"><Sparkles size={16}/></div><div><strong>Private workspace</strong><small>Supabase backed journal</small></div><ShieldCheck size={15}/></div><button className="profile"><span className="avatar">HT</span><span><b>Trading workspace</b><small>{supabaseConfigured ? 'Protected by row security' : 'Database not configured'}</small></span><MoreHorizontal size={17}/></button></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <nav className="mobile-bottom-nav" aria-label="Primary navigation">{mobileNavigation.map(({ page: item, icon: Icon }) => <button key={item} type="button" className={page === item ? 'active' : ''} aria-current={page === item ? 'page' : undefined} onClick={() => { setPage(item); setMobileNav(false) }}><Icon size={18}/><span>{item === 'Upload Screenshot' ? 'Upload' : item}</span></button>)}</nav>
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="crumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{page}</b></div><div className="top-actions"><span className="date-pill"><CalendarDays size={15}/>{new Date().toLocaleDateString('en-US',{month:'short',year:'numeric'})}</span><button className="icon-button" aria-label="Help"><CircleHelp size={18}/></button><span className="top-avatar">HT</span></div></header>
      <div className="page-content">
        {error && <div className="notice error-notice"><span><b>Workspace connection</b><small>{error}</small></span><button onClick={() => void refresh()}><Activity size={15}/>Retry</button></div>}
        {success && <div className="notice success-notice" role="status"><span><b>Saved</b><small>{success}</small></span><button onClick={() => setSuccess(null)} aria-label="Dismiss success"><X size={15}/></button></div>}
        {loading && <div className="loading-bar"><span/></div>}
        {page === 'Dashboard' && <Dashboard trades={trades} positions={positions} stats={stats} now={now} onAdd={() => setTradeForm('new')} onTrades={() => setPage('Trades')} onDetail={setDetailTrade} currency={settings.currency}/>}
        {page === 'Trades' && <TradesPage trades={filteredTrades} allTrades={trades} query={query} setQuery={setQuery} status={filterStatus} setStatus={setFilterStatus} direction={filterDirection} setDirection={setFilterDirection} exchange={filterExchange} setExchange={setFilterExchange} onAdd={() => setTradeForm('new')} onEdit={setTradeForm} onDetail={setDetailTrade} onDelete={deleteTrade} now={now} currency={settings.currency}/>}
        {page === 'Open Positions' && <PositionsPage trades={positions} now={now} onAdd={() => setTradeForm('new')} onDetail={setDetailTrade} currency={settings.currency}/>}
        {page === 'Upload Screenshot' && <UploadPage screenshots={screenshots} trades={trades} dragging={dragging} setDragging={setDragging} inputRef={inputRef} cameraInputRef={cameraInputRef} onFiles={uploadFiles} onReview={setReviewScreenshot} onRetry={retryScreenshot} onDelete={shot => safeAction(() => deleteScreenshot(shot))} onAssociate={(shot, id) => safeAction(() => associateScreenshot(shot.id, id || null))} now={now}/>}
        {page === 'Analytics' && <AnalyticsPage trades={trades} stats={stats} range={analyticsRange} setRange={setAnalyticsRange} currency={settings.currency}/>}
        {page === 'Settings' && <SettingsPage settings={settings} onSave={changeSettings} identity={identity} tradeCount={trades.length} onLinkWorkspace={linkCurrentWorkspace} onConnectWorkspace={connectWorkspace}/>}
      </div>
    </main>
    {tradeForm && <TradeEditor trade={tradeForm === 'new' ? null : tradeForm} onClose={() => setTradeForm(null)} onSave={saveTrade} working={working}/>}
    {detailTrade && <TradeDetail trade={detailTrade} screenshots={screenshots.filter(screenshot => screenshot.tradeId === detailTrade.id)} onClose={() => setDetailTrade(null)} onEdit={() => { setTradeForm(detailTrade); setDetailTrade(null) }} onDelete={() => void deleteTrade(detailTrade)} currency={settings.currency}/>}
    {reviewScreenshot && <ManualExtractionReview screenshot={reviewScreenshot} trades={trades} onClose={() => setReviewScreenshot(null)} onSave={manualExtraction} working={working}/>}
  </div>
}

function Button({ children, onClick, secondary = false, disabled = false }: { children: React.ReactNode; onClick?: () => void; secondary?: boolean; disabled?: boolean }) {
  return <button type="button" className={`button ${secondary ? 'button-secondary' : 'button-primary'}`} onClick={onClick} disabled={disabled}>{children}</button>
}
function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>
}
function StatCard({ label, value, icon: Icon, detail }: { label: string; value: string; icon: typeof Wallet; detail?: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={16}/></span></div><strong className="stat-value">{value}</strong><div className="stat-foot"><span>{detail ?? 'From saved trade records'}</span></div></div>
}
function Numeric({ value, currency = 'USDT', percentValue = false }: { value: number | null; currency?: string; percentValue?: boolean }) {
  if (value == null) return <span className="muted">—</span>
  const output = percentValue ? pct(value) : usd(value, currency)
  return <span className={value > 0 ? 'positive' : value < 0 ? 'negative' : ''}>{output}</span>
}
const chartTooltip = { contentStyle: { background: '#151b22', border: '1px solid #303842', borderRadius: 10, color: '#edf2f7', fontSize: 12 }, labelStyle: { color: '#9aa5b3' }, itemStyle: { color: '#e5ebf2' }, formatter: (value: number) => formatCurrencyUSD(value) }

function Dashboard({ trades, positions, stats, now, onAdd, onTrades, onDetail, currency }: { trades: Trade[]; positions: Trade[]; stats: ReturnType<typeof getAnalytics>; now: number; onAdd: () => void; onTrades: () => void; onDetail: (trade: Trade) => void; currency: string }) {
  const realized = getRealizedPnl(trades)
  const equity = buildEquityCurve(trades)
  const closed = trades.filter(trade => trade.status === 'CLOSED')
  const today = new Date().toISOString().slice(0, 10)
  const todayPnl = closed.filter(trade => trade.closeTime?.slice(0, 10) === today).reduce((sum, trade) => sum + (trade.pnlAmount ?? 0), 0)
  const month = today.slice(0, 7)
  const monthlyPnl = closed.filter(trade => trade.closeTime?.slice(0, 7) === month).reduce((sum, trade) => sum + (trade.pnlAmount ?? 0), 0)
  const totalOpenMargin = positions.reduce((sum, trade) => sum + (trade.margin ?? 0), 0)
  const timeBuckets = buildPnlBuckets(trades, 'day').slice(-14)
  return <><PageTitle eyebrow={new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).toUpperCase()} title="Good morning, trader" description="Your database-backed trading journal at a glance." action={<><Button secondary><CalendarDays size={15}/>{settingsLabel('All time')}</Button><Button onClick={onAdd}><Plus size={16}/> Add trade</Button></>}/>
    <div className="stats-grid dashboard-stats"><StatCard label="Total trades" value={String(stats.totalTrades)} icon={BarChart3}/><StatCard label="Open positions" value={String(stats.openTrades)} icon={Activity}/><StatCard label="Closed trades" value={String(stats.closedTrades)} icon={Check}/><StatCard label="Total investment" value={usd(stats.totalInvestment,currency)} icon={Wallet}/><StatCard label="Realized P&L" value={usd(realized,currency)} icon={TrendingUp}/><StatCard label="Unrealized P&L" value="—" icon={Activity} detail="Connect a verified market price feed"/><StatCard label="Win rate" value={`${stats.winRate.toFixed(1)}%`} icon={ShieldCheck}/><StatCard label="Average P&L" value={usd(stats.closedTrades ? realized / stats.closedTrades : 0,currency)} icon={BarChart3}/><StatCard label="Today's P&L" value={usd(todayPnl,currency)} icon={Clock3} detail="Known, realized P&L today"/><StatCard label="Monthly P&L" value={usd(monthlyPnl,currency)} icon={CalendarDays} detail="Known, realized P&L this month"/></div>
    <div className="dashboard-grid"><section className="panel equity-panel"><div className="panel-head"><div><h2>Portfolio performance</h2><p>Equity curve from closed trades with known P&L</p></div><span className="subtle-badge">Database records</span></div><div className="chart-legend"><span><i className="legend-line"/>Equity</span><span><i className="legend-dot"/>Daily P&L</span></div><div className="large-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={equity}><defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#54d6a0" stopOpacity={.21}/><stop offset="100%" stopColor="#54d6a0" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#242c35" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#778391',fontSize:11}}/><YAxis tickFormatter={(value:number)=>formatCurrencyUSD(value)} axisLine={false} tickLine={false} tick={{fill:'#778391',fontSize:11}} width={49}/><Tooltip {...chartTooltip}/><Area type="monotone" dataKey="equity" stroke="#59d8a2" strokeWidth={2.4} fill="url(#equityFill)"/></AreaChart></ResponsiveContainer></div><div className="chart-summary"><span>Realized P&L <b>{usd(realized,currency)}</b></span><span>Win rate <b>{stats.winRate.toFixed(1)}%</b></span><span>Open margin <b>{usd(totalOpenMargin,currency)}</b></span></div></section>
      <section className="panel positions-panel"><div className="panel-head"><div><h2>Open positions <span className="count-badge">{positions.length}</span></h2><p>Current journal exposure</p></div><button className="text-button" onClick={onTrades}>Trades <ArrowUpRight size={14}/></button></div><div className="position-list">{positions.slice(0,5).map(trade=><div className="position-row clickable" key={trade.id} onClick={() => onDetail(trade)}><span className="coin-icon">{trade.symbol.slice(0,1)}</span><span className="position-name"><b>{trade.symbol} <i>{trade.direction}</i></b><small>{trade.exchange ?? 'Exchange unset'} · {trade.leverage ?? '—'}×</small></span><span className="position-price"><b>{usd(trade.avgEntry,currency)}</b><small>Entry · {localDate(trade.openTime)}</small></span><span className="position-pnl"><b>{trade.status}</b><small>Running {formatDuration(getTradeHoldingSeconds(trade,now))}</small></span></div>)}</div><div className="panel-bottom"><span>Live prices</span><b className="muted">Not connected</b></div></section>
      <section className="panel recent-panel"><div className="panel-head"><div><h2>Recent trades</h2><p>Latest saved trade records</p></div><button className="text-button" onClick={onTrades}>All trades <ArrowUpRight size={14}/></button></div><TradeTable trades={[...trades].sort((a,b)=>(b.openTime??b.createdAt).localeCompare(a.openTime??a.createdAt)).slice(0,5)} now={now} currency={currency} onOpen={onDetail}/></section>
      <section className="panel insight-panel"><div className="panel-head"><div><h2>Trading snapshot</h2><p>Only trades with reported P&L are scored</p></div></div><div className="snapshot-main"><div className="snapshot-ring" style={{'--value':`${stats.winRate}%`} as React.CSSProperties}><div><b>{stats.winRate.toFixed(0)}%</b><small>win rate</small></div></div><div className="snapshot-stats"><span><i className="win-dot"/>Take profit <b>{stats.tpHits}</b></span><span><i className="loss-dot"/>Stop loss <b>{stats.slHits}</b></span><span><i className="open-dot"/>Manual close <b>{stats.manualClosures}</b></span></div></div><div className="snapshot-footer"><span>Profit factor</span><b>{Number.isFinite(stats.profitFactor)?stats.profitFactor.toFixed(2):'—'}</b><span className="snapshot-pill"><ShieldCheck size={13}/>Database</span></div></section>
      <section className="panel recent-panel"><div className="panel-head"><div><h2>Daily P&L</h2><p>Recent closed trade results</p></div></div><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeBuckets}><CartesianGrid stroke="#242c35" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#778391',fontSize:9}}/><YAxis tickFormatter={(value:number)=>formatCurrencyUSD(value)} axisLine={false} tickLine={false} tick={{fill:'#778391',fontSize:9}}/><Tooltip {...chartTooltip}/><Bar dataKey="pnl" radius={[4,4,0,0]}>{timeBuckets.map((point,index)=><Cell key={index} fill={point.pnl>=0?'#55d69e':'#fa7180'}/>)}</Bar></BarChart></ResponsiveContainer></div></section>
    </div>
  </>
}
function settingsLabel(value: string) { return value }

function TradeTable({ trades, now, currency, onOpen, onEdit, onDelete }: { trades: Trade[]; now: number; currency: string; onOpen?: (trade:Trade)=>void; onEdit?: (trade:Trade)=>void; onDelete?: (trade:Trade)=>void }) {
  return <div className="table-wrap"><table><thead><tr><th>DATE</th><th>SYMBOL</th><th>DIRECTION</th><th>LEV.</th><th>QTY</th><th>MARGIN</th><th>AVG ENTRY</th><th>CLOSE PRICE</th><th>TP</th><th>SL</th><th>P&L</th><th>P&L %</th><th>STATUS</th><th>CLOSE REASON</th><th>HOLDING TIME</th>{onEdit&&<th>Actions</th>}</tr></thead><tbody>{trades.map(trade=>{const seconds=getTradeHoldingSeconds(trade,now);return <tr key={trade.id} className={onOpen?'click-row':''} onClick={()=>onOpen?.(trade)}><td>{trade.openTime?new Date(trade.openTime).toLocaleDateString():'—'}</td><td><div className="asset-cell"><span className="asset-logo">{trade.symbol.slice(0,1)}</span><span><b>{trade.symbol}</b><small>{trade.exchange??'Exchange unset'} · {trade.marketType??'Market unset'}</small></span></div></td><td><span className={`direction ${trade.direction.toLowerCase()}`}>{trade.direction}</span></td><td>{trade.leverage==null?'—':`${trade.leverage}×`}</td><td>{trade.quantity??'—'}</td><td>{usd(trade.margin,currency)}</td><td>{usd(trade.avgEntry,currency)}</td><td>{usd(trade.closePrice,currency)}</td><td>{usd(trade.takeProfit,currency)}</td><td>{usd(trade.stopLoss,currency)}</td><td><Numeric value={trade.pnlAmount} currency={currency}/></td><td><Numeric value={trade.pnlPercentage} percentValue/></td><td><span className={`status status-${trade.status.toLowerCase()}`}><i/>{trade.status}</span></td><td>{trade.closeReason??'—'}</td><td>{trade.status==='OPEN'?`Running: ${formatDuration(seconds)}`:`Held: ${formatDuration(seconds)}`}</td>{onEdit&&<td><div className="row-actions" onClick={event=>event.stopPropagation()}><button onClick={()=>onEdit(trade)} aria-label="Edit trade"><SlidersHorizontal size={15}/></button><button onClick={()=>onDelete?.(trade)} aria-label="Delete trade"><Trash2 size={15}/></button></div></td>}</tr>})}</tbody></table>
    <div className="trade-mobile-list">{trades.map(trade=>{const seconds=getTradeHoldingSeconds(trade,now);return <article className="trade-mobile-card" key={trade.id} onClick={()=>onOpen?.(trade)} onKeyDown={event=>event.key==='Enter'&&onOpen?.(trade)} role={onOpen?'button':undefined} tabIndex={onOpen?0:undefined}>
      <header><span className="asset-logo">{trade.symbol.slice(0,1)}</span><span className="trade-card-title"><b>{trade.symbol}</b><small>{trade.exchange??'Exchange unset'} · {trade.marketType??'Market unset'}</small></span><span className={`direction ${trade.direction.toLowerCase()}`}>{trade.direction}</span><b>{trade.leverage==null?'—':`${trade.leverage}×`}</b></header>
      <div className="trade-card-fields">{[['Date',trade.openTime?new Date(trade.openTime).toLocaleDateString():'—'],['Quantity',trade.quantity??'—'],['Size',usd(trade.size,currency)],['Margin',usd(trade.margin,currency)],['Average entry',usd(trade.avgEntry,currency)],['LTP',usd(trade.ltp,currency)],['Liquidation',usd(trade.liquidationPrice,currency)],['Close price',usd(trade.closePrice,currency)],['Take profit',usd(trade.takeProfit,currency)],['Stop loss',usd(trade.stopLoss,currency)],['P&L',<Numeric value={trade.pnlAmount} currency={currency}/>],['P&L %',<Numeric value={trade.pnlPercentage} percentValue/>],['Status',<span className={`status status-${trade.status.toLowerCase()}`}><i/>{trade.status}</span>],['Close reason',trade.closeReason??'—'],['Holding time',`${trade.status==='OPEN'?'Running':'Held'}: ${formatDuration(seconds)}`],['Setup',trade.setup??'—'],['Notes',trade.notes??'—']].map(([label,value])=><div key={String(label)}><small>{label}</small><b>{value}</b></div>)}</div>
      {onEdit&&<footer><button className="button button-secondary" onClick={event=>{event.stopPropagation();onEdit(trade)}}><SlidersHorizontal size={14}/>Edit</button><button className="button button-secondary" onClick={event=>{event.stopPropagation();onDelete?.(trade)}}><Trash2 size={14}/>Delete</button></footer>}
    </article>})}</div>{trades.length===0&&<div className="empty-state"><Search size={22}/><b>No saved trades</b><span>Add a trade or review an uploaded screenshot to get started.</span></div>}</div>
}

function TradesPage({ trades, allTrades, query, setQuery, status, setStatus, direction, setDirection, exchange, setExchange, onAdd, onEdit, onDetail, onDelete, now, currency }: { trades:Trade[]; allTrades:Trade[]; query:string; setQuery:(v:string)=>void; status:string; setStatus:(v:string)=>void; direction:string; setDirection:(v:string)=>void; exchange:string; setExchange:(v:string)=>void; onAdd:()=>void; onEdit:(v:Trade)=>void; onDetail:(v:Trade)=>void; onDelete:(v:Trade)=>void; now:number; currency:string }) {
  const exchanges=[...new Set(allTrades.map(trade=>trade.exchange).filter((value):value is string=>Boolean(value)))].sort()
  return <><PageTitle eyebrow="TRADE JOURNAL" title="Trades" description="Every position stays a separate, traceable record." action={<Button onClick={onAdd}><Plus size={16}/> Add trade</Button>}/><section className="panel trades-panel"><div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search symbol, setup, exchange"/></div><label className="filter-select"><Filter size={14}/><select value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select></label><label className="filter-select"><select value={direction} onChange={event=>setDirection(event.target.value)}><option value="ALL">All sides</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></label><label className="filter-select"><select value={exchange} onChange={event=>setExchange(event.target.value)}><option value="ALL">All exchanges</option>{exchanges.map(item=><option key={item}>{item}</option>)}</select></label><span className="toolbar-spacer"/><span className="result-count">{trades.length} trades</span></div><TradeTable trades={trades} now={now} currency={currency} onOpen={onDetail} onEdit={onEdit} onDelete={onDelete}/></section></>
}

function PositionsPage({ trades, now, onAdd, onDetail, currency }: { trades:Trade[]; now:number; onAdd:()=>void; onDetail:(trade:Trade)=>void; currency:string }) {
  return <><PageTitle eyebrow="OPEN WORKSPACE" title="Open positions" description="Position details and running time from your saved records." action={<Button onClick={onAdd}><Plus size={16}/> Add position</Button>}/><div className="stats-grid compact-stats"><StatCard label="Open trades" value={String(trades.length)} icon={Activity}/><StatCard label="Capital in play" value={usd(trades.reduce((sum,trade)=>sum+(trade.margin??0),0),currency)} icon={Wallet}/><StatCard label="Avg leverage" value={trades.length?`${(trades.reduce((sum,trade)=>sum+(trade.leverage??0),0)/trades.length).toFixed(1)}×`:'—'} icon={SlidersHorizontal}/><StatCard label="Live P&L" value="—" icon={TrendingUp} detail="Exchange price feed not configured"/></div><div className="position-cards">{trades.map(trade=><article className="panel position-card clickable" key={trade.id} onClick={()=>onDetail(trade)}><div className="position-card-head"><span className="asset-logo large-logo">{trade.symbol.slice(0,1)}</span><span><b>{trade.symbol}</b><small>{trade.exchange??'Exchange unset'} · {trade.marketType??'Market unset'}</small></span><span className={`direction ${trade.direction.toLowerCase()}`}>{trade.direction}</span></div><div className="position-card-pnl"><span>Current P&L</span><b className="muted">Unavailable <small>· no price feed</small></b></div><div className="price-grid"><span>Avg. Entry<b>{usd(trade.avgEntry,currency)}</b></span><span>Quantity<b>{trade.quantity??'—'}</b></span><span>Leverage<b>{trade.leverage==null?'—':`${trade.leverage}×`}</b></span><span>Margin<b>{usd(trade.margin,currency)}</b></span><span>Liquidation<b>{usd(trade.liquidationPrice,currency)}</b></span><span>Duration<b>Running {formatDuration(getTradeHoldingSeconds(trade,now))}</b></span></div><div className="risk-track"><span>Stop loss <b>{usd(trade.stopLoss,currency)}</b></span><span>Take profit <b>{usd(trade.takeProfit,currency)}</b></span></div></article>)}</div>{!trades.length&&<div className="panel empty-large"><Activity size={28}/><h3>No open positions</h3><p>An OPEN trade remains open until an explicit close transaction is confirmed.</p></div>}</>
}

const extractionStatuses: Record<Screenshot['extractionStatus'], string> = { UPLOADED:'Uploaded', PROCESSING:'Processing', EXTRACTED:'Extracted · review needed', MATCHED:'Matched', COMPLETED:'Completed', FAILED:'OCR unavailable / failed' }
function UploadPage({ screenshots, trades, dragging, setDragging, inputRef, cameraInputRef, onFiles, onReview, onRetry, onDelete, onAssociate, now }: { screenshots:Screenshot[]; trades:Trade[]; dragging:boolean; setDragging:(value:boolean)=>void; inputRef:React.RefObject<HTMLInputElement>; cameraInputRef:React.RefObject<HTMLInputElement>; onFiles:(files:FileList|File[])=>Promise<void>; onReview:(shot:Screenshot)=>void; onRetry:(shot:Screenshot)=>Promise<void>; onDelete:(shot:Screenshot)=>Promise<void>; onAssociate:(shot:Screenshot,id:string)=>Promise<void>; now:number }) {
  return <><PageTitle eyebrow="SCREENSHOT LIBRARY" title="Upload screenshots" description="Images are stored privately in Supabase Storage with traceable metadata."/><div className="upload-layout"><section className={`panel dropzone ${dragging?'dragging':''}`} onDragOver={event=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);void onFiles(event.dataTransfer.files)}}><input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event=>{if(event.target.files)void onFiles(event.target.files);event.target.value=''}}/><input ref={cameraInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={event=>{if(event.target.files)void onFiles(event.target.files);event.target.value=''}}/><span className="upload-icon"><Upload size={23}/></span><h2>Drop screenshots here</h2><p>or browse your files to upload</p><div className="upload-buttons"><Button secondary onClick={()=>inputRef.current?.click()}>Photo library / files</Button><button className="button button-secondary camera-upload-button" onClick={()=>cameraInputRef.current?.click()}><Camera size={16}/>Use camera</button></div><small>PNG, JPG, JPEG, WEBP · Up to 10 MB · SHA-256 duplicate check</small></section><aside className="panel ocr-card"><span className="ocr-icon"><Sparkles size={18}/></span><h3>Browser OCR ready</h3><p>Images are read locally with Tesseract. The form shows the returned text and parsed fields so you can verify them before saving.</p><div><Check size={14}/> OCR status and errors visible</div><div><Check size={14}/> Manual correction before saving</div><div><Check size={14}/> Original screenshot remains stored</div></aside></div><div className="section-title-row"><div><h2>Upload history</h2><p>{screenshots.length} records from Supabase</p></div></div>{screenshots.length?<div className="screenshot-grid">{screenshots.map(shot=><article className="panel screenshot-card" key={shot.id}>{shot.previewUrl?<img src={shot.previewUrl} alt={shot.originalName}/>:<div className="preview-unavailable"><FileImage size={23}/><span>Private image preview unavailable</span></div>}<div className="screenshot-meta"><FileImage size={15}/><span><b>{shot.originalName}</b><small>{(shot.sizeBytes/1024).toFixed(0)} KB · {new Date(shot.uploadedAt).toLocaleString()}</small><small>{shot.screenshotType} · {extractionStatuses[shot.extractionStatus]}</small></span><button onClick={()=>void onDelete(shot)} aria-label="Delete screenshot"><Trash2 size={15}/></button></div><label className="associate-label">Trade association<select value={shot.tradeId??''} onChange={event=>void onAssociate(shot,event.target.value)}><option value="">No trade linked</option>{trades.map(trade=><option key={trade.id} value={trade.id}>{trade.symbol} · {trade.direction} · {trade.status}</option>)}</select></label><div className="screenshot-actions">{(shot.extractionStatus==='FAILED'||shot.extractionStatus==='UPLOADED')&&<Button secondary onClick={()=>void onRetry(shot)}>Retry OCR</Button>}<span>Uploaded {formatDuration(Math.floor((now-Date.parse(shot.uploadedAt))/1000))} ago</span><Button secondary onClick={()=>onReview(shot)}>Review / correct</Button></div></article>)}</div>:<div className="panel empty-large upload-empty"><FileImage size={27}/><h3>No screenshots yet</h3><p>Uploads and extracted metadata will be stored here.</p></div>}</>
}

function AnalyticsPage({ trades, stats, range, setRange, currency }: { trades:Trade[]; stats:ReturnType<typeof getAnalytics>; range:string; setRange:(value:string)=>void; currency:string }) {
  const windowDays:Record<string,number>={'Today':1,'7 Days':7,'30 Days':30,'3 Months':90,'6 Months':180,'1 Year':365,'All Time':Infinity}
  const cutoff=Date.now()-windowDays[range]*86400000
  const filtered=trades.filter(trade=>trade.status==='CLOSED'&&trade.closeTime&&Date.parse(trade.closeTime)>=cutoff)
  const currentStats=getAnalytics(filtered)
  const equity=buildEquityCurve(filtered)
  const periods=[['Weekly','week'],['Monthly','month'],['Yearly','year']] as const
  const directions=buildDirectionPerformance(filtered)
  const coins=buildCoinPerformance(filtered)
  const reasons=buildCloseReasonPerformance(filtered)
  const holding=filtered.map(trade=>trade.holdingDurationSeconds).filter((value):value is number=>value!=null)
  return <><PageTitle eyebrow="DATABASE PERFORMANCE" title="Analytics" description="All performance measures are calculated from persisted trades." action={<label className="select-button"><CalendarDays size={15}/><select value={range} onChange={event=>setRange(event.target.value)}>{['Today','7 Days','30 Days','3 Months','6 Months','1 Year','All Time'].map(item=><option key={item}>{item}</option>)}</select><ChevronDown size={14}/></label>}/><div className="analytics-kpis"><StatCard label="Total P&L" value={usd(currentStats.totalPnl,currency)} icon={TrendingUp}/><StatCard label="Total profit" value={usd(currentStats.totalProfit,currency)} icon={ArrowUpRight}/><StatCard label="Total loss" value={usd(-currentStats.totalLoss,currency)} icon={ArrowDownRight}/><StatCard label="Win rate" value={`${currentStats.winRate.toFixed(1)}%`} icon={ShieldCheck}/><StatCard label="Loss rate" value={`${currentStats.lossRate.toFixed(1)}%`} icon={Activity}/><StatCard label="Profit factor" value={Number.isFinite(currentStats.profitFactor)?currentStats.profitFactor.toFixed(2):'—'} icon={BarChart3}/><StatCard label="Average profit" value={usd(currentStats.averageProfit,currency)} icon={TrendingUp}/><StatCard label="Average loss" value={usd(-currentStats.averageLoss,currency)} icon={ArrowDownRight}/><StatCard label="Avg. P&L %" value={pct(currentStats.averagePnlPercentage)} icon={Activity}/><StatCard label="Max drawdown" value={usd(-currentStats.maxDrawdown,currency)} icon={ArrowDownRight}/><StatCard label="Trades · open / closed" value={`${currentStats.totalTrades} · ${currentStats.openTrades} / ${currentStats.closedTrades}`} icon={BarChart3}/><StatCard label="Capital invested" value={usd(currentStats.totalInvestment,currency)} icon={Wallet}/><StatCard label="TP / SL / manual" value={`${currentStats.tpHits} / ${currentStats.slHits} / ${currentStats.manualClosures}`} icon={Check}/><StatCard label="Average holding" value={currentStats.averageHoldingTimeSeconds==null?'—':formatDuration(Math.round(currentStats.averageHoldingTimeSeconds))} icon={Clock3}/></div><div className="analytics-grid"><section className="panel analytics-wide"><div className="panel-head"><div><h2>Equity curve</h2><p>Known realized P&L · {range}</p></div><span className="subtle-badge">Supabase trades</span></div><div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={equity}><defs><linearGradient id="aFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7297f7" stopOpacity={.22}/><stop offset="100%" stopColor="#7297f7" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#242c35" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#778391',fontSize:11}}/><YAxis tickFormatter={(value:number)=>formatCurrencyUSD(value)} axisLine={false} tickLine={false} tick={{fill:'#778391',fontSize:11}}/><Tooltip {...chartTooltip}/><Area type="monotone" dataKey="equity" stroke="#809cf9" strokeWidth={2} fill="url(#aFill)"/></AreaChart></ResponsiveContainer></div></section>{periods.map(([label,unit])=><section className="panel" key={unit}><div className="panel-head"><div><h2>{label} P&L</h2><p>Closed trades by {unit}</p></div></div><PnlChart data={buildPnlBuckets(filtered,unit)}/></section>)}<section className="panel"><div className="panel-head"><div><h2>Win vs. loss</h2><p>Known P&L outcomes</p></div></div><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{name:'Wins',value:currentStats.totalProfit},{name:'Losses',value:currentStats.totalLoss}]} dataKey="value" innerRadius={61} outerRadius={82} paddingAngle={4} stroke="none"><Cell fill="#55d69e"/><Cell fill="#fa7180"/></Pie><Tooltip {...chartTooltip}/></PieChart></ResponsiveContainer><div className="donut-center"><b>{currentStats.winRate.toFixed(0)}%</b><small>win rate</small></div></div></section><section className="panel"><div className="panel-head"><div><h2>Long vs. short</h2><p>Realized P&L by direction</p></div></div><PnlChart data={directions.map(item=>({date:item.direction,pnl:item.pnl}))}/></section><section className="panel"><div className="panel-head"><div><h2>Coin performance</h2><p>Known realized P&L</p></div></div><div className="coin-performance">{coins.map(item=><div key={item.symbol}><span className="asset-logo">{item.symbol[0]}</span><b>{item.symbol}</b><span className="bar-track"><i style={{width:`${Math.max(7,Math.abs(item.pnl)/Math.max(1,...coins.map(coin=>Math.abs(coin.pnl)))*100)}%`,background:item.pnl>=0?'#55d69e':'#fa7180'}}/></span><Numeric value={item.pnl} currency={currency}/></div>)}</div></section><section className="panel"><div className="panel-head"><div><h2>Exit outcomes</h2><p>TP, SL and manual close count</p></div></div><PnlChart data={reasons.map(item=>({date:item.reason,pnl:item.count}))}/></section><section className="panel"><div className="panel-head"><div><h2>Average holding time</h2><p>Closed trades with known duration</p></div></div><div className="holding-summary"><Clock3 size={23}/><b>{holding.length?formatDuration(Math.round(holding.reduce((sum,value)=>sum+value,0)/holding.length)):'—'}</b><span>{holding.length} trades with duration recorded</span></div></section><span className="sr-only">All-time database total: {usd(stats.totalPnl,currency)}</span></div></>
}
function PnlChart({ data }: { data:{date:string;pnl:number}[] }) {
  return <div className="small-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid stroke="#242c35" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#9aa5b3',fontSize:10}}/><YAxis tickFormatter={(value:number)=>formatCurrencyUSD(value)} axisLine={false} tickLine={false} tick={{fill:'#778391',fontSize:9}} width={38}/><Tooltip {...chartTooltip}/><Bar dataKey="pnl" radius={[5,5,0,0]}>{data.map((item,index)=><Cell key={index} fill={item.pnl>=0?'#55d69e':'#fa7180'}/>)}</Bar></BarChart></ResponsiveContainer></div>
}

function SettingsPage({ settings, onSave, identity, tradeCount, onLinkWorkspace, onConnectWorkspace }: {
  settings:UserSettings; onSave:(next:UserSettings)=>Promise<void>; identity:{ id:string; email:string|null; isAnonymous:boolean }|null
  tradeCount:number; onLinkWorkspace:(email:string)=>Promise<void>; onConnectWorkspace:(email:string)=>Promise<void>
}) {
  const [draft,setDraft]=useState(settings)
  const [email,setEmail]=useState('')
  useEffect(()=>setDraft(settings),[settings])
  const patch=(value:Partial<UserSettings>)=>setDraft(current=>({...current,...value}))
  return <><PageTitle eyebrow="SUPABASE PROFILE" title="Settings" description="Trading defaults and appearance are stored in your protected user settings row."/><div className="settings-layout"><section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><SlidersHorizontal size={18}/></span><div><h2>Trading defaults</h2><p>Prefill fields when adding a trade.</p></div></div><SettingRow label="Default leverage" description="Default for new positions"><select value={draft.defaultLeverage} onChange={event=>patch({defaultLeverage:Number(event.target.value)})}>{[1,2,3,5,10,20,50].map(value=><option key={value}>{value}</option>)}</select></SettingRow><SettingRow label="Default exchange" description="Preferred trading venue"><select value={draft.defaultExchange} onChange={event=>patch({defaultExchange:event.target.value})}>{['Binance','Bybit','OKX','Coinbase','Other'].map(value=><option key={value}>{value}</option>)}</select></SettingRow><SettingRow label="Default market" description="Spot or derivatives"><select value={draft.defaultMarket} onChange={event=>patch({defaultMarket:event.target.value})}>{['Spot','Perpetual','Futures'].map(value=><option key={value}>{value}</option>)}</select></SettingRow><SettingRow label="Display currency" description="Portfolio values use USD"><b>USD ($)</b></SettingRow></section><section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><Sparkles size={18}/></span><div><h2>Appearance and analytics</h2><p>Preferences are stored with this Supabase identity.</p></div></div><SettingRow label="Color theme" description="Dark or light interface"><div className="segmented"><button className={draft.theme==='dark'?'chosen':''} onClick={()=>patch({theme:'dark'})}>Dark</button><button className={draft.theme==='light'?'chosen':''} onClick={()=>patch({theme:'light'})}>Light</button></div></SettingRow><SettingRow label="Default date range" description="Initial analytics filter"><select value={draft.defaultRange} onChange={event=>patch({defaultRange:event.target.value})}>{['Today','7 Days','30 Days','3 Months','6 Months','1 Year','All Time'].map(value=><option key={value}>{value}</option>)}</select></SettingRow><SettingRow label="Default analytics view" description="Preferred chart"><select value={draft.analyticsView} onChange={event=>patch({analyticsView:event.target.value})}>{['Equity curve','Daily P&L','Win vs loss'].map(value=><option key={value}>{value}</option>)}</select></SettingRow></section>
    <section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><Activity size={18}/></span><div><h2>Sync devices</h2><p>Connect the same Supabase identity on your phone and computer to share trades securely.</p></div></div>
      {identity && !identity.isAnonymous && identity.email ? <p role="status">This device is connected as <b>{identity.email}</b>. Sign in with this email on your other devices.</p> : <>
        <p>{tradeCount > 0 ? `This browser owns ${tradeCount} saved trade${tradeCount===1?'':'s'}. Link this identity first to preserve and share them.` : 'This browser has no saved trades. Sign in to the email linked from the device that owns your trades.'}</p>
        <label className="workspace-email">Email address<input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={event=>setEmail(event.target.value)}/></label>
        {tradeCount > 0 ? <Button disabled={!email.includes('@')} onClick={()=>void onLinkWorkspace(email)}>Link this workspace to email</Button> : <Button disabled={!email.includes('@')} onClick={()=>void onConnectWorkspace(email)}>Send sign-in link</Button>}
        <small>Link the phone with existing trades first and confirm its email. Then enter that same email here to sign in. Your trade rows stay protected by Supabase RLS.</small>
      </>}
    </section>
    <section className="panel privacy-note"><ShieldCheck size={19}/><div><b>Protected by row-level security</b><p>Device linking reuses the same Supabase user ID; it does not make data public or combine trades by symbol. Never add service-role keys to this client.</p></div></section><div className="settings-save"><Button onClick={()=>void onSave({...draft,currency:'USD'})}><Check size={15}/> Save settings</Button></div></div></>
}
function SettingRow({ label, description, children }: { label:string; description:string; children:React.ReactNode }) { return <div className="setting-row"><div><b>{label}</b><small>{description}</small></div>{children}</div> }

function TradeEditor({ trade, onClose, onSave, working }: { trade:Trade|null; onClose:()=>void; onSave:(draft:TradeDraft,trade?:Trade)=>Promise<void>; working:boolean }) {
  const [form,setForm]=useState<TradeDraft>(()=>draftFromTrade(trade??undefined))
  const patch=<K extends keyof TradeDraft>(key:K,value:TradeDraft[K])=>setForm(current=>({...current,[key]:value}))
  const numeric=(key:keyof TradeDraft,label:string,value:number|null,step='any')=><label>{label}<input type="number" step={step} value={value??''} onChange={event=>patch(key,(event.target.value===''?null:Number(event.target.value)) as TradeDraft[typeof key])}/></label>
  const date=(key:'openTime'|'closeTime',label:string,value:string|null)=><label>{label}<input type="datetime-local" value={value?new Date(value).toISOString().slice(0,16):''} onChange={event=>patch(key,event.target.value?new Date(event.target.value).toISOString():null)}/></label>
  const submit=(event:React.FormEvent)=>{event.preventDefault();const draft={...form,symbol:form.symbol.trim().toUpperCase()};if(draft.status==='CLOSED'&&draft.openTime&&draft.closeTime){const seconds=Math.max(0,Math.floor((Date.parse(draft.closeTime)-Date.parse(draft.openTime))/1000));draft.holdingDurationSeconds=seconds;draft.holdingDurationDisplay=formatDuration(seconds)}if(draft.status==='OPEN'){draft.closeReason=null;draft.closeTime=null;draft.closePrice=null;draft.pnlAmount=null;draft.pnlPercentage=null;draft.holdingDurationSeconds=null;draft.holdingDurationDisplay=null}void onSave(draft,trade??undefined)}
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="trade-modal" onSubmit={submit}><div className="modal-head"><div><div className="eyebrow">PERSISTED TRADE</div><h2>{trade?'Edit trade':'Add trade'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="form-grid"><label className="span-two">Symbol<input required placeholder="BTC/USDT" value={form.symbol} onChange={event=>patch('symbol',event.target.value)}/></label><label>Direction<select value={form.direction} onChange={event=>patch('direction',event.target.value as Direction)}><option value="LONG">Long</option><option value="SHORT">Short</option></select></label><label>Status<select value={form.status} onChange={event=>patch('status',event.target.value as Trade['status'])}><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select></label><label>Exchange<input value={form.exchange??''} onChange={event=>patch('exchange',event.target.value||null)}/></label><label>Market type<input value={form.marketType??''} onChange={event=>patch('marketType',event.target.value||null)}/></label>{numeric('leverage','Leverage',form.leverage)}{numeric('quantity','Quantity',form.quantity)}{numeric('size','Size',form.size)}{numeric('margin','Margin',form.margin)}{numeric('avgEntry','Average entry',form.avgEntry)}{numeric('ltp','LTP',form.ltp)}{numeric('liquidationPrice','Liquidation price',form.liquidationPrice)}{numeric('takeProfit','Take profit',form.takeProfit)}{numeric('stopLoss','Stop loss',form.stopLoss)}{date('openTime','Open time',form.openTime)}{date('closeTime','Close time',form.closeTime)}{numeric('closePrice','Close price',form.closePrice)}{numeric('pnlAmount','P&L amount',form.pnlAmount)}{numeric('pnlPercentage','P&L percentage',form.pnlPercentage)}<label>Close reason<select value={form.closeReason??''} onChange={event=>patch('closeReason',(event.target.value||null) as CloseReason|null)}><option value="">Unknown / not closed</option><option value="TP_HIT">TP hit</option><option value="SL_HIT">SL hit</option><option value="MANUAL_CLOSE">Manual close</option><option value="UNKNOWN">Unknown</option></select></label><label>Exchange position ID<input value={form.exchangePositionId??''} onChange={event=>patch('exchangePositionId',event.target.value||null)}/></label><label>Setup<input value={form.setup??''} onChange={event=>patch('setup',event.target.value||null)}/></label><label className="span-two">Notes<textarea rows={3} value={form.notes??''} onChange={event=>patch('notes',event.target.value||null)}/></label></div><div className="modal-footer"><Button secondary onClick={onClose}>Cancel</Button><button className="button button-primary" type="submit" disabled={working}><Check size={15}/>{working?'Saving…':'Save trade'}</button></div></form></div>
}

function TradeDetail({ trade, screenshots, onClose, onEdit, onDelete, currency }: { trade:Trade; screenshots:Screenshot[]; onClose:()=>void; onEdit:()=>void; onDelete:()=>void; currency:string }) {
  const [events,setEvents]=useState<Awaited<ReturnType<typeof listTradeEvents>>>([])
  useEffect(()=>{let active=true;void listTradeEvents(trade.id).then(data=>{if(active)setEvents(data)}).catch(()=>{if(active)setEvents([])});return()=>{active=false}},[trade.id])
  const fields:[string,string][]=[['Symbol',trade.symbol],['Direction',trade.direction],['Exchange',trade.exchange??'—'],['Market',trade.marketType??'—'],['Leverage',trade.leverage==null?'—':`${trade.leverage}×`],['Quantity',trade.quantity?.toString()??'—'],['Size',usd(trade.size,currency)],['Margin',usd(trade.margin,currency)],['Average entry',usd(trade.avgEntry,currency)],['LTP',usd(trade.ltp,currency)],['Liquidation price',usd(trade.liquidationPrice,currency)],['Take profit',usd(trade.takeProfit,currency)],['Stop loss',usd(trade.stopLoss,currency)],['Close price',usd(trade.closePrice,currency)],['P&L',usd(trade.pnlAmount,currency)],['P&L %',pct(trade.pnlPercentage)],['Status',trade.status],['Close reason',trade.closeReason??'—'],['Open time',localDate(trade.openTime)],['Close time',localDate(trade.closeTime)],['Holding time',`${trade.status==='OPEN'?'Running':'Held'}: ${formatDuration(getTradeHoldingSeconds(trade))}`],['Notes',trade.notes??'—']]
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><div className="trade-modal detail-modal"><div className="modal-head"><div><div className="eyebrow">TRADE DETAIL</div><h2>{trade.symbol} · {trade.direction}</h2></div><div className="heading-action"><Button secondary onClick={onEdit}><SlidersHorizontal size={14}/>Edit</Button><button className="icon-button" onClick={onClose}><X size={18}/></button></div></div><div className="detail-fields">{fields.map(([label,value])=><div key={label}><small>{label}</small><b>{value}</b></div>)}</div><h3 className="detail-section-title">Lifecycle events</h3><div className="event-list">{events.map(event=><div key={event.id}><i/><span><b>{event.eventType}</b><small>{localDate(event.eventTime)}{event.price!=null?` · ${usd(event.price,currency)}`:''}{event.percentage!=null?` · ${pct(event.percentage)}`:''}</small></span></div>)}{!events.length&&<span className="muted">No event records.</span>}</div><h3 className="detail-section-title">Associated screenshots</h3><div className="detail-images">{screenshots.map(shot=>shot.previewUrl?<a href={shot.previewUrl} target="_blank" rel="noreferrer" key={shot.id}><img src={shot.previewUrl} alt={shot.originalName}/><small>{shot.screenshotType}</small></a>:<span key={shot.id}>{shot.originalName} · {shot.screenshotType}</span>)}{!screenshots.length&&<span className="muted">No screenshots linked.</span>}</div><div className="modal-footer"><Button secondary onClick={onDelete}><Trash2 size={14}/>Delete trade</Button><Button onClick={onClose}>Done</Button></div></div></div>
}

function ManualExtractionReview({ screenshot, trades, onClose, onSave, working }: { screenshot:Screenshot; trades:Trade[]; onClose:()=>void; onSave:(shot:Screenshot,data:ExtractedTradeData,tradeId?:string)=>Promise<void>; working:boolean }) {
  const prior=(screenshot.extractionRawData??{}) as Partial<ExtractedTradeData>
  const initial=mapExtractionToForm(prior)
  const [kind,setKind]=useState<ScreenshotType>(screenshot.screenshotType)
  const [symbol,setSymbol]=useState(initial.symbol)
  const [direction,setDirection]=useState<Direction|''>(initial.direction)
  const [eventTime,setEventTime]=useState(initial.eventTime)
  const [tradeId,setTradeId]=useState(screenshot.tradeId??'')
  const [values,setValues]=useState<Record<string,string>>(initial.values)
  useEffect(()=>{
    const current=(screenshot.extractionRawData??{}) as Partial<ExtractedTradeData>
    const mapped=mapExtractionToForm(current)
    setKind(screenshot.screenshotType);setSymbol(mapped.symbol);setDirection(mapped.direction);setEventTime(mapped.eventTime);setValues(mapped.values)
    if(screenshot.tradeId)setTradeId(screenshot.tradeId)
  },[screenshot.id,screenshot.extractionRawData,screenshot.screenshotType,screenshot.tradeId])
  const numericField=(key:string,label:string)=><label>{label}<input type="number" step="any" value={values[key]??''} onChange={event=>setValues(current=>({...current,[key]:event.target.value}))}/></label>
  const submit=(event:React.FormEvent)=>{event.preventDefault();const data:ExtractedTradeData={screenshotType:kind,symbol:symbol.trim()?symbol.trim().toUpperCase():null,direction:direction||null,eventTime:eventTime?new Date(eventTime).toISOString():null,...Object.fromEntries(Object.entries(values).filter(([,value])=>value!=='').map(([key,value])=>[key,Number(value)])),rawText:typeof prior.rawText==='string'?prior.rawText:undefined,confidence:typeof prior.confidence==='number'?prior.confidence:null};void onSave(screenshot,data,tradeId||undefined)}
  const rawText=typeof prior.rawText==='string'?prior.rawText:''
  const extractionError=typeof screenshot.extractionRawData?.error==='string'?screenshot.extractionRawData.error:null
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="trade-modal" onSubmit={submit}><div className="modal-head"><div><div className="eyebrow">SCREENSHOT EXTRACTION REVIEW</div><h2>{screenshot.originalName}</h2><p className="modal-subtitle">OCR status: {extractionStatuses[screenshot.extractionStatus]}. Review every value before confirming it into your trades.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div>{screenshot.previewUrl&&<img className="review-image" src={screenshot.previewUrl} alt={screenshot.originalName}/>}<details className="ocr-debug" open><summary>Extraction diagnostics · {screenshot.extractionStatus}</summary>{extractionError&&<p className="notice error-notice">OCR failed: {extractionError}</p>}<h4>Raw OCR text</h4><pre>{rawText||'No OCR text was saved. Check the error above, then choose Retry OCR from upload history.'}</pre><h4>Normalized parser result</h4><pre>{JSON.stringify(prior,null,2)}</pre></details><div className="form-grid"><label>Screenshot type<select value={kind} onChange={event=>setKind(event.target.value as ScreenshotType)}>{['OPEN_TRANSACTION','CLOSE_TRANSACTION','PNL','POSITION_DETAILS','UNKNOWN'].map(value=><option key={value}>{value}</option>)}</select></label><label>Associate trade<select value={tradeId} onChange={event=>setTradeId(event.target.value)}><option value="">Let matcher decide / unmatched</option>{trades.map(trade=><option key={trade.id} value={trade.id}>{trade.symbol} · {trade.direction} · {trade.status}</option>)}</select></label><label>Symbol<input value={symbol} onChange={event=>setSymbol(event.target.value)} placeholder="Symbol from screenshot"/></label><label>Direction<select value={direction} onChange={event=>setDirection(event.target.value as Direction|'')}><option value="">Not detected</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></label><label>Event time<input type="datetime-local" value={eventTime} onChange={event=>setEventTime(event.target.value)}/></label>{numericField('transactionPrice','Transaction price')}{numericField('closePrice','Close price')}{numericField('leverage','Leverage')}{numericField('quantity','Quantity')}{numericField('size','Size')}{numericField('margin','Margin')}{numericField('avgEntry','Average entry')}{numericField('ltp','LTP')}{numericField('liquidationPrice','Liquidation price')}{numericField('takeProfit','Take profit')}{numericField('stopLoss','Stop loss')}{numericField('pnlAmount','P&L amount')}{numericField('pnlPercentage','P&L percentage')}</div><p className="manual-note">Only screenshot values or values you enter are saved. Missing values remain null.</p><div className="modal-footer"><Button secondary onClick={onClose}>Cancel</Button><button className="button button-primary" type="submit" disabled={working}><Check size={15}/>{working?'Saving…':'Confirm extracted data'}</button></div></form></div>
}
