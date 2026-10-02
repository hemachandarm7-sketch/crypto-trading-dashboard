import { useCallback, useEffect, useRef, useState } from 'react'
import type { Screenshot, Trade, UserSettings } from '../types'
import { defaultUserSettings, listScreenshots, listTrades, loadUserSettings } from '../services/tradeRepository'
import { getWorkspaceIdentity, requireSupabase, supabaseConfigured, type WorkspaceIdentity } from '../services/supabaseClient'
import { createRevalidationTrigger, subscribeWorkspaceChanges } from '../services/workspaceSync'

export function useSupabaseWorkspace() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [identity, setIdentity] = useState<WorkspaceIdentity | null>(null)
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false)
      setError('Supabase is not configured. Copy .env.example to .env, add the project URL and anon key, then restart Vite.')
      return
    }
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const [nextTrades, nextScreenshots, nextSettings, nextIdentity] = await Promise.all([listTrades(), listScreenshots(), loadUserSettings(), getWorkspaceIdentity()])
      if (currentRequest !== requestId.current) return
      setTrades(nextTrades)
      setScreenshots(nextScreenshots)
      setSettings(nextSettings)
      setIdentity(nextIdentity)
    } catch (cause) {
      if (currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : 'Could not load the Supabase workspace.')
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!supabaseConfigured) return
    const client = requireSupabase()
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setIdentity(user ? { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous === true } : null)
      // Supabase advises deferring follow-up auth work until after its callback completes.
      window.setTimeout(() => { void refresh() }, 0)
    })
    return () => subscription.unsubscribe()
  }, [refresh])

  useEffect(() => {
    if (!identity?.id) return
    const client = requireSupabase()
    const revalidate = createRevalidationTrigger(refresh, () => document.visibilityState === 'visible')
    const removeChannel = subscribeWorkspaceChanges(client, identity.id, revalidate)
    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    const interval = window.setInterval(revalidate, 30_000)
    return () => {
      revalidate.cancel()
      window.clearInterval(interval)
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
      removeChannel()
    }
  }, [identity?.id, refresh])

  return { trades, setTrades, screenshots, setScreenshots, settings, setSettings, loading, error, setError, refresh, identity }
}
