import { useState } from 'react'
import { Bitcoin, LoaderCircle, ShieldCheck } from 'lucide-react'
import { requestPasswordReset, signInAccount, signUpAccount, updateAccountPassword } from '../services/supabaseClient'
import './account-screens.css'

type AuthMode = 'login' | 'signup' | 'forgot'

function messageFrom(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Authentication could not be completed. Please try again.'
}

export function AccountGate({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const changeMode = (next: AuthMode) => { setMode(next); setError(null); setSuccess(null) }
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null)
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
        if (password !== confirmPassword) throw new Error('The passwords do not match.')
        const result = await signUpAccount({ displayName: name, email, password })
        if (result.needsEmailConfirmation) {
          setSuccess('Account created. Check your email to verify the address, then return here and sign in.')
          setMode('login'); setPassword(''); setConfirmPassword('')
        } else await onAuthenticated()
      } else if (mode === 'forgot') {
        await requestPasswordReset(email)
        setSuccess('If an account exists for this email, a password reset link has been sent.')
      } else {
        await signInAccount(email, password)
        await onAuthenticated()
      }
    } catch (cause) { setError(messageFrom(cause)) }
    finally { setBusy(false) }
  }

  return <main className="account-screen"><section className="account-card">
    <div className="account-brand"><span><Bitcoin size={22}/></span><b>orbit<span>.</span></b></div>
    <div className="account-eyebrow">PRIVATE TRADING JOURNAL</div>
    <h1>{mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}</h1>
    <p className="account-intro">Sign in with the same account on each device to see one synchronized trading journal.</p>
    {error && <div className="account-message account-error" role="alert">{error}</div>}
    {success && <div className="account-message account-success" role="status">{success}</div>}
    <form onSubmit={submit}>
      {mode === 'signup' && <label>Full name<input autoComplete="name" required value={name} onChange={event => setName(event.target.value)} placeholder="Your name"/></label>}
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></label>
      {mode !== 'forgot' && <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters"/></label>}
      {mode === 'signup' && <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter password again"/></label>}
      {mode === 'login' && <button type="button" className="account-link forgot-link" onClick={() => changeMode('forgot')}>Forgot password?</button>}
      <button className="account-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="account-spin" size={17}/> Please wait…</> : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}</button>
    </form>
    <div className="account-switch">{mode === 'signup' ? <>Already have an account? <button className="account-link" onClick={() => changeMode('login')}>Sign in</button></> : mode === 'forgot' ? <button className="account-link" onClick={() => changeMode('login')}>Back to sign in</button> : <>New to Orbit? <button className="account-link" onClick={() => changeMode('signup')}>Create an account</button></>}</div>
    <div className="account-security"><ShieldCheck size={16}/><span>Your trading data is private and protected by Supabase row-level security.</span></div>
  </section></main>
}

export function PasswordRecovery({ onComplete }: { onComplete: () => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null)
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return }
    setBusy(true)
    try { await updateAccountPassword(password); await onComplete(); setSuccess(true) }
    catch (cause) { setError(messageFrom(cause)) }
    finally { setBusy(false) }
  }
  return <main className="account-screen"><section className="account-card">
    <div className="account-brand"><span><Bitcoin size={22}/></span><b>orbit<span>.</span></b></div>
    <div className="account-eyebrow">ACCOUNT SECURITY</div><h1>Choose a new password</h1>
    <p className="account-intro">Set a new password for your trading dashboard account.</p>
    {error && <div className="account-message account-error" role="alert">{error}</div>}
    {success && <div className="account-message account-success" role="status">Password updated. You can now sign in on your other devices.</div>}
    {!success && <form onSubmit={submit}><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)}/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></label><button className="account-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></form>}
  </section></main>
}

export function SessionLoading() {
  return <main className="account-screen"><section className="account-card account-loading"><div className="account-brand"><span><Bitcoin size={22}/></span><b>orbit<span>.</span></b></div><LoaderCircle className="account-spin" size={22}/><p>Checking your secure session…</p></section></main>
}
