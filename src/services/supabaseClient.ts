import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

export interface WorkspaceIdentity { id: string; email: string | null; isAnonymous: boolean }

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

/** Auth creates an isolated RLS identity; it is not an application login. Enable anonymous sign-ins in Supabase Auth. */
let identityPromise: Promise<string> | null = null

export async function ensureSupabaseUser(): Promise<string> {
  const client = requireSupabase()
  const { data: current, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (current.session?.user.id) return current.session.user.id
  identityPromise ??= client.auth.signInAnonymously().then(({ data, error }) => {
    if (error) throw new Error(`Could not start a private workspace. Enable anonymous sign-ins in Supabase Auth. ${error.message}`)
    if (!data.user) throw new Error('Supabase did not return a user identity.')
    return data.user.id
  }).finally(() => { identityPromise = null })
  return identityPromise
}

export async function getWorkspaceIdentity(): Promise<WorkspaceIdentity | null> {
  const { data, error } = await requireSupabase().auth.getUser()
  if (error) throw error
  const user = data.user
  return user ? { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous === true } : null
}

/** Add an email identity to this browser's anonymous user; Supabase retains its UUID and rows. */
export async function linkWorkspaceEmail(email: string): Promise<void> {
  const client = requireSupabase()
  await ensureSupabaseUser()
  const { error } = await client.auth.updateUser({ email: email.trim() }, { emailRedirectTo: window.location.origin })
  if (error) throw error
}

/** Send a one-time link for an already-linked workspace, never creating a new account. */
export async function sendWorkspaceSignIn(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}
