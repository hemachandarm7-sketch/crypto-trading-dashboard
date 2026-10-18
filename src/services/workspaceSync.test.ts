import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import { createRevalidationTrigger, subscribeWorkspaceChanges } from './workspaceSync'

afterEach(() => vi.useRealTimers())

describe('workspace revalidation', () => {
  it('debounces concurrent realtime changes into one database refresh', () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const revalidate = createRevalidationTrigger(refresh, () => true, 25)
    revalidate()
    revalidate()
    revalidate()
    vi.advanceTimersByTime(25)
    expect(refresh).toHaveBeenCalledTimes(1)
    revalidate.cancel()
  })

  it('does not refresh while the document is hidden, but refreshes on visible trigger', () => {
    vi.useFakeTimers()
    let visible = false
    const refresh = vi.fn()
    const revalidate = createRevalidationTrigger(refresh, () => visible, 5)
    revalidate()
    vi.runAllTimers()
    expect(refresh).not.toHaveBeenCalled()
    visible = true
    revalidate()
    vi.runAllTimers()
    expect(refresh).toHaveBeenCalledTimes(1)
    revalidate.cancel()
  })

  it('subscribes once to all workspace tables and removes the channel on cleanup', () => {
    const handlers: unknown[] = []
    const channel = {
      on: vi.fn((_type: string, filter: unknown, handler: unknown) => { handlers.push({ filter, handler }); return channel }),
      subscribe: vi.fn(),
    }
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => 'ok'),
    } as unknown as SupabaseClient<Database>
    const cleanup = subscribeWorkspaceChanges(client, 'owner-id', vi.fn())
    expect(client.channel).toHaveBeenCalledTimes(1)
    expect(channel.on).toHaveBeenCalledTimes(4)
    expect(channel.subscribe).toHaveBeenCalledTimes(1)
    cleanup()
    expect(client.removeChannel).toHaveBeenCalledTimes(1)
  })
})
