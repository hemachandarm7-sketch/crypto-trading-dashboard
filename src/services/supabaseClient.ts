import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

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
export async function ensureSupabaseUser(): Promise<string> {
  const client = requireSupabase()
  const { data: current, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (current.session?.user.id) return current.session.user.id
  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw new Error(`Could not start a private workspace. Enable anonymous sign-ins in Supabase Auth. ${error.message}`)
  if (!data.user) throw new Error('Supabase did not return a user identity.')
  return data.user.id
}
