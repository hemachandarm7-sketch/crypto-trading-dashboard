export interface AuthUserLike {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  is_anonymous?: boolean
  user_metadata?: Record<string, unknown>
}

export interface AuthSessionLike { user: AuthUserLike }

export interface WorkspaceIdentity {
  id: string
  email: string | null
  isAnonymous: boolean
  displayName: string | null
  accountSetupPending: boolean
  emailConfirmed: boolean
}

export function mapWorkspaceIdentity(user: AuthUserLike): WorkspaceIdentity {
  return {
    id: user.id,
    email: user.email ?? null,
    isAnonymous: user.is_anonymous === true,
    displayName: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
    accountSetupPending: user.user_metadata?.account_setup_pending === true,
    emailConfirmed: Boolean(user.email_confirmed_at),
  }
}

export function requireWorkspaceUserId(session: AuthSessionLike | null): string {
  if (!session?.user.id) throw new Error('Sign in to your account before accessing trading data.')
  return session.user.id
}

type AnonymousLinkAuth = {
  getSession: () => Promise<{ data: { session: AuthSessionLike | null }; error: unknown | null }>
  updateUser: (attributes: { email: string; data: Record<string, unknown> }, options: { emailRedirectTo: string }) => Promise<{ error: unknown | null }>
}

/** Upgrade this browser's current anon ID in place; never link an unrelated signed-in account. */
export async function upgradeAnonymousIdentity(auth: AnonymousLinkAuth, email: string, displayName: string, origin: string): Promise<void> {
  const { data, error: sessionError } = await auth.getSession()
  if (sessionError) throw sessionError
  const session = data.session
  if (!session?.user.id) throw new Error('This browser no longer has the original workspace session. Sign in to the account that owns the trades.')
  if (session.user.is_anonymous !== true) throw new Error('Only an anonymous workspace can be upgraded here. Sign in to edit this account.')
  const { error } = await auth.updateUser({
    email: email.trim(),
    data: { full_name: displayName.trim(), account_setup_pending: true },
  }, { emailRedirectTo: `${origin}/?account=verified` })
  if (error) throw error
}
