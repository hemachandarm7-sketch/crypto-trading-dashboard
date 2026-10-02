import { useCallback, useEffect, useRef, useState } from 'react'
import type { Screenshot, Trade, UserSettings } from '../types'
import { defaultUserSettings, listScreenshots, listTrades, loadUserSettings } from '../services/tradeRepository'
import { getWorkspaceIdentity, requireSupabase, supabaseConfigured, type WorkspaceIdentity } from '../services/supabaseClient'
import { createRevalidationTrigger, subscribeWorkspaceChanges } from '../services/workspaceSync'
import { mapWorkspaceIdentity } from '../services/accountIdentity'

export function useSupabaseWorkspace() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [identity, setIdentity] = useState<WorkspaceIdentity | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const requestId = useRef(0)
  const identityId = useRef<string | null>(null)

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
      const nextIdentity = await getWorkspaceIdentity()
      if (currentRequest !== requestId.current) return
      if (!nextIdentity) {
        identityId.current = null
        setTrades([])
        setScreenshots([])
        setSettings(defaultUserSettings)
        setIdentity(null)
        return
      }
      const [nextTrades, nextScreenshots, nextSettings] = await Promise.all([listTrades(), listScreenshots(), loadUserSettings()])
      if (currentRequest !== requestId.current) return
      setTrades(nextTrades)
      setScreenshots(nextScreenshots)
      setSettings(nextSettings)
      setIdentity(nextIdentity)
      identityId.current = nextIdentity.id
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
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      const user = session?.user
      const nextId = user?.id ?? null
      if (nextId !== identityId.current) {
        requestId.current += 1
        setTrades([])
        setScreenshots([])
        setSettings(defaultUserSettings)
      }
      identityId.current = nextId
      setIdentity(user ? mapWorkspaceIdentity(user) : null)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'SIGNED_OUT') setPasswordRecovery(false)
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
    window.addEventListener('online', revalidate)
    const interval = window.setInterval(revalidate, 30_000)
    return () => {
      revalidate.cancel()
      window.clearInterval(interval)
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
      window.removeEventListener('online', revalidate)
      removeChannel()
    }
  }, [identity?.id, refresh])

  return { trades, setTrades, screenshots, setScreenshots, settings, setSettings, loading, error, setError, refresh, identity, passwordRecovery, setPasswordRecovery }
}
