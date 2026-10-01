import { useCallback, useEffect, useState } from 'react'
import type { Screenshot, Trade, UserSettings } from '../types'
import { defaultUserSettings, listScreenshots, listTrades, loadUserSettings } from '../services/tradeRepository'
import { supabaseConfigured } from '../services/supabaseClient'

export function useSupabaseWorkspace() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false)
      setError('Supabase is not configured. Copy .env.example to .env, add the project URL and anon key, then restart Vite.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [nextTrades, nextScreenshots, nextSettings] = await Promise.all([listTrades(), listScreenshots(), loadUserSettings()])
      setTrades(nextTrades)
      setScreenshots(nextScreenshots)
      setSettings(nextSettings)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the Supabase workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return { trades, setTrades, screenshots, setScreenshots, settings, setSettings, loading, error, setError, refresh }
}
