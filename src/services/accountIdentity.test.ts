import { describe, expect, it, vi } from 'vitest'
import { mapWorkspaceIdentity, requireWorkspaceUserId, upgradeAnonymousIdentity } from './accountIdentity'

describe('account identity migration', () => {
  it('requires an existing session instead of creating an unrelated anonymous owner', () => {
    expect(() => requireWorkspaceUserId(null)).toThrow('Sign in to your account')
    expect(requireWorkspaceUserId({ user: { id: 'owner-123', is_anonymous: true } })).toBe('owner-123')
  })

  it('links email on the current anonymous user and marks account setup pending', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'legacy-phone-owner', is_anonymous: true } } }, error: null }),
      updateUser,
    }

    await upgradeAnonymousIdentity(auth, ' trader@example.com ', ' Trader Name ', 'https://journal.example')

    expect(updateUser).toHaveBeenCalledOnce()
    expect(updateUser).toHaveBeenCalledWith(
      { email: 'trader@example.com', data: { full_name: 'Trader Name', account_setup_pending: true } },
      { emailRedirectTo: 'https://journal.example/?account=verified' },
    )
    expect(auth.getSession).toHaveBeenCalledOnce()
  })

  it('does not replace or relink an already authenticated account', async () => {
    const updateUser = vi.fn()
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'permanent-account', is_anonymous: false } } }, error: null }),
      updateUser,
    }

    await expect(upgradeAnonymousIdentity(auth, 'other@example.com', 'Other User', 'https://journal.example'))
      .rejects.toThrow('Only an anonymous workspace can be upgraded')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('keeps the profile name and setup state sourced from Supabase auth metadata', () => {
    expect(mapWorkspaceIdentity({
      id: 'owner-123',
      email: 'trader@example.com',
      email_confirmed_at: '2026-10-02T10:00:00Z',
      is_anonymous: false,
      user_metadata: { full_name: 'Trader', account_setup_pending: true },
    })).toEqual({
      id: 'owner-123',
      email: 'trader@example.com',
      isAnonymous: false,
      displayName: 'Trader',
      accountSetupPending: true,
      emailConfirmed: true,
    })
  })
})
