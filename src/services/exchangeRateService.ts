interface FrankfurterResponse {
  amount: number
  base: string
  date: string
  rates: { USD?: number }
}

export interface HistoricalUsdRate { rate: number; date: string }

const rateCache = new Map<string, { value: HistoricalUsdRate; expiresAt: number }>()
const CACHE_MS = 24 * 60 * 60 * 1000

/** Frankfurter's public reference data endpoint; no credential or key is required. */
export async function getInrToUsdRate(date = new Date().toISOString().slice(0, 10)): Promise<HistoricalUsdRate> {
  const cached = rateCache.get(date)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/${encodeURIComponent(date)}?base=INR&symbols=USD`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Exchange rate service returned HTTP ${response.status}.`)
    const body = await response.json() as FrankfurterResponse
    const rate = body.rates?.USD
    if (!(typeof rate === 'number' && Number.isFinite(rate) && rate > 0) || !body.date) {
      throw new Error('A valid historical INR/USD exchange rate was not returned.')
    }
    const value = { rate, date: body.date }
    rateCache.set(date, { value, expiresAt: Date.now() + CACHE_MS })
    return value
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export function clearExchangeRateCacheForTests(): void { rateCache.clear() }
