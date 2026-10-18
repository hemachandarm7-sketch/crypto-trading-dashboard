import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import { mapWorkspaceIdentity, requireWorkspaceUserId, upgradeAnonymousIdentity, type WorkspaceIdentity } from './accountIdentity'

export type { WorkspaceIdentity } from './accountIdentity'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseConfigured = Boolean(url && anonKey)
export const supabase: SupabaseClient<Database> | null = supabaseConfigured
  ? createClient<Database>(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) throw new Error('Supabase is not configured. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}

/** Return the current session owner. Never silently create a different workspace after logout. */
export async function ensureSupabaseUser(): Promise<string> {
  const client = requireSupabase()
  const { data: current, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  return requireWorkspaceUserId(current.session)
}

export async function getWorkspaceIdentity(): Promise<WorkspaceIdentity | null> {
  const { data, error } = await requireSupabase().auth.getSession()
  if (error) throw error
  const user = data.session?.user
  return user ? mapWorkspaceIdentity(user) : null
}

/** Add an email identity to this browser's anonymous user; Supabase retains its UUID and rows. */
export async function linkWorkspaceEmail(email: string, displayName: string): Promise<void> {
  const client = requireSupabase()
  await upgradeAnonymousIdentity(client.auth, email, displayName, window.location.origin)
}

export async function signUpAccount(input: { displayName: string; email: string; password: string }): Promise<{ needsEmailConfirmation: boolean }> {
  const client = requireSupabase()
  const { data, error } = await client.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { emailRedirectTo: `${window.location.origin}/?account=verified`, data: { full_name: input.displayName.trim() } },
  })
  if (error) throw error
  return { needsEmailConfirmation: !data.session }
}

export async function signInAccount(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

export async function finishAccountSetup(password: string): Promise<void> {
  const client = requireSupabase()
  const identity = await getWorkspaceIdentity()
  if (!identity || identity.isAnonymous || !identity.emailConfirmed) throw new Error('Confirm your email address on this device before setting a password.')
  const { error } = await client.auth.updateUser({ password, data: { account_setup_pending: false } })
  if (error) throw error
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?auth=recovery` })
  if (error) throw error
}

export async function updateAccountPassword(password: string): Promise<void> {
  const { error } = await requireSupabase().auth.updateUser({ password })
  if (error) throw error
}

export async function signOutAccount(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut()
  if (error) throw error
}
