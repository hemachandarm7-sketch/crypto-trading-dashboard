import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const workspaceTables = ['trades', 'trade_events', 'screenshots', 'user_settings'] as const

export function subscribeWorkspaceChanges(client: SupabaseClient<Database>, userId: string, onChange: () => void): () => void {
  const channel = client.channel(`workspace-sync-${userId}`)
  for (const table of workspaceTables) {
    // RLS limits delivered rows; unfiltered subscription also catches deletes that
    // publish only the old row's primary key (and omit filter columns).
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  }
  channel.subscribe()
  return () => { void client.removeChannel(channel) }
}

export function createRevalidationTrigger(refresh: () => void | Promise<void>, isVisible: () => boolean, delayMs = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const trigger = () => {
    if (!isVisible()) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = undefined; void refresh() }, delayMs)
  }
  trigger.cancel = () => { if (timer) clearTimeout(timer); timer = undefined }
  return trigger
}
