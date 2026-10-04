# 🔒 Security Guidelines

## Reporting Security Issues

If you discover a security vulnerability, **DO NOT** open a public GitHub issue. Instead:

1. Email: hemachandarm7-sketch@github.com
2. Subject: "[SECURITY] Vulnerability Report"
3. Describe the issue with reproduction steps
4. Allow 48 hours for response

---

## Environment Setup (SAFE)

### ❌ NEVER

```bash
# ❌ Do NOT commit .env files
git add .env

# ❌ Do NOT put secrets in code
const API_KEY = "sk_live_..."

# ❌ Do NOT share tokens in documentation
# Value: your-secret-key-here

# ❌ Do NOT log sensitive data
console.log("Token:", token)
```

### ✅ ALWAYS

```bash
# ✅ Copy from .env.example
cp .env.example .env.local

# ✅ Add to .env.local (never commit)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# ✅ Use environment variables
const url = import.meta.env.VITE_SUPABASE_URL

# ✅ .env.local in .gitignore
# .env.local is automatically ignored
```

---

## Credentials Management

### Supabase Setup

1. **Get your keys:**
   - Go to: https://app.supabase.com/project/[ID]/settings/api
   - Copy: Project URL
   - Copy: Public (Anon) Key

2. **Never expose:**
   - Service Role Key (server-side only)
   - Database password
   - JWT secrets

3. **If compromised:**
   - Go to settings → API
   - Click "Rotate" on the compromised key
   - Update all instances

### GitHub Setup

1. **For development:**
   - Use Personal Access Tokens (PAT)
   - Scope to minimum permissions needed
   - Set expiration (7-30 days)

2. **For CI/CD:**
   - Use GitHub Secrets
   - Repo → Settings → Secrets and variables
   - Reference as: `${{ secrets.TOKEN_NAME }}`

3. **If leaked:**
   - GitHub → Settings → Tokens
   - Delete immediately
   - Check usage logs for compromised data

### Vercel Setup

1. **Environment Variables:**
   - Project → Settings → Environment Variables
   - Mark as: Production, Preview, Development
   - Never save in code

2. **Access Tokens:**
   - Account → Tokens
   - Use short expiration (1-7 days)
   - Rotate regularly

3. **If exposed:**
   - Account → Tokens
   - Delete compromised token
   - Generate new one
   - Update in CI/CD

---

## Code Security

### Input Validation

```typescript
// ❌ BAD - No validation
async function saveTrade(data: any) {
  await db.insert(trades).values(data)
}

// ✅ GOOD - Validate first
import { z } from 'zod'

const tradeSchema = z.object({
  symbol: z.string().min(1).max(20),
  quantity: z.number().positive(),
  price: z.number().positive(),
})

async function saveTrade(data: unknown) {
  const validated = tradeSchema.parse(data)
  await db.insert(trades).values(validated)
}
```

### XSS Prevention

```typescript
// ❌ BAD - Raw HTML injection
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ GOOD - Sanitized/escaped
<div>{userInput}</div>  // React escapes by default
```

### SQL Injection

```typescript
// ❌ BAD - String concatenation
const query = `SELECT * FROM trades WHERE symbol = '${symbol}'`

// ✅ GOOD - Parameterized queries
const { data } = await supabase
  .from('trades')
  .select()
  .eq('symbol', symbol)
```

---

## Dependency Security

### Regular Updates

```bash
# Check for vulnerabilities
npm audit

# Fix automatically (safe)
npm audit fix

# Fix all including breaking (test required)
npm audit fix --force

# Check for outdated packages
npm outdated
```

### Before Installing

```bash
# Check package before installing
npm info package-name

# Verify official source
# - Check GitHub stars/issues
# - Look at update frequency
# - Read security advisories
```

### After Installing

```bash
# Always run audit
npm audit

# Review changes
git diff package.json

# Test build & run
npm run build
npm run preview
```

---

## Database Security (Supabase)

### Row Level Security (RLS)

✅ **ALWAYS enable RLS:**

```sql
-- Enable RLS on table
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Policy: Users see only their own trades
CREATE POLICY "Users can see own trades"
ON trades FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can only insert their own trades
CREATE POLICY "Users can create own trades"
ON trades FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

### What to Audit

- [ ] RLS enabled on all tables
- [ ] Policies restrict by `auth.uid()`
- [ ] Service role key never exposed
- [ ] Public access disabled for sensitive tables
- [ ] Database backups configured
- [ ] Connections encrypted (SSL)

---

## API Security

### Rate Limiting

Implement rate limiting to prevent abuse:

```typescript
// Pseudo-code - implement in your backend
const rateLimiter = new RateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 10,           // 10 requests
  keyGenerator: (req) => req.user.id,
})

app.use(rateLimiter.middleware())
```

### CORS Configuration

```typescript
// Vercel/Next.js
const headers = {
  'Access-Control-Allow-Origin': 'https://your-domain.com',
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
```

### Authentication

```typescript
// ✅ Verify user for sensitive operations
async function updateTrade(id: string, data: any) {
  const user = await getCurrentUser()
  
  // Verify ownership
  const trade = await db.select().from(trades)
    .where(and(
      eq(trades.id, id),
      eq(trades.userId, user.id)
    ))
  
  if (!trade) throw new Error('Unauthorized')
  
  return db.update(trades).set(data).where(eq(trades.id, id))
}
```

---

## Deployment Security

### GitHub Actions

✅ **Use secrets for sensitive values:**

```yaml
# .github/workflows/deploy.yml
- name: Deploy
  run: npm run build
  env:
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

### Environment-Specific Configuration

```bash
# .env.local - development
VITE_SUPABASE_URL=https://local.supabase.co
VITE_SUPABASE_ANON_KEY=dev-key

# Vercel - production
# Set in: Project → Settings → Environment Variables
```

---

## Monitoring & Logging

### What to Log

✅ **Log these for security:**
- Failed authentication attempts
- Unauthorized data access attempts
- Trade modifications
- User account changes
- API errors

### What NOT to Log

❌ **Never log:**
- Passwords
- API keys / tokens
- Sensitive financial data
- User personal information

### Implementation

```typescript
// Use structured logging
import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
})

// Log security events
logger.warn({
  event: 'unauthorized_access',
  user_id: user.id,
  resource: 'trades',
  timestamp: new Date()
})
```

---

## Security Checklist

### Before Deployment

- [ ] No secrets in code/docs/git
- [ ] npm audit shows 0 vulnerabilities
- [ ] Environment variables set in Vercel
- [ ] RLS policies enabled and tested
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] CORS properly scoped

### During Development

- [ ] Use .env.local (never .env)
- [ ] Never commit credentials
- [ ] Review dependencies before install
- [ ] Regular npm audit checks
- [ ] Use environment-specific configs

### After Deployment

- [ ] Monitor error logs
- [ ] Check for security alerts
- [ ] Review access logs
- [ ] Test RLS policies
- [ ] Verify secrets not exposed

---

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security](https://supabase.com/docs/learn/security)
- [Vercel Security](https://vercel.com/docs/security)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

## Recent Security Fixes

**October 4, 2026:**
- ✅ Removed VERCEL_ENV_SETUP.md (had exposed keys)
- ✅ Fixed npm vulnerabilities (0 high-severity issues)
- ✅ Updated tailwindcss to v4 (vulnerable deps fixed)
- ✅ Added Security Guidelines (this file)
- ✅ Created SECURITY_AUDIT_REPORT.md

---

**Last Updated:** October 4, 2026  
**Status:** 🟢 SECURE (pending manual key rotation)
