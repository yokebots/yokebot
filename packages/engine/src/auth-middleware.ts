/**
 * auth-middleware.ts — JWT verification for Supabase auth + API key auth
 *
 * Verifies the Bearer token from the dashboard against Supabase.
 * Supports both HS256 (legacy/anon key) and ES256 (new Supabase Auth tokens)
 * by fetching the JWKS public key from Supabase's well-known endpoint.
 *
 * Also supports API key authentication via `yk_live_` prefixed tokens.
 */

import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { validateApiKey, type ApiKey } from './api-keys.ts'
import type { Db } from './db/types.ts'

export interface AuthUser {
  id: string
  email: string
  activeTeamId?: string
  teamRole?: string
}

// Extend Express Request to include user and apiKey
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
      apiKey?: ApiKey
    }
  }
}

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''

// Paths that don't require authentication
const PUBLIC_PATHS = ['/health', '/api/ollama', '/api/config', '/api/contact', '/api/unsubscribe']

// Module-level DB reference for API key validation (set at startup)
let _apiKeyDb: Db | null = null

/** Called once at startup from index.ts to inject the DB reference */
export function setApiKeyDb(db: Db): void {
  _apiKeyDb = db
}

// Cached JWKS public key for ES256 verification
let cachedPublicKey: crypto.KeyObject | null = null
let jwksFetchedAt = 0
const JWKS_CACHE_MS = 60 * 60 * 1000 // 1 hour

async function getJwksPublicKey(): Promise<crypto.KeyObject | null> {
  // Return cached key if fresh
  if (cachedPublicKey && Date.now() - jwksFetchedAt < JWKS_CACHE_MS) {
    return cachedPublicKey
  }

  // Determine JWKS URL from SUPABASE_URL or from the Supabase project ref
  let jwksUrl = ''
  if (SUPABASE_URL) {
    jwksUrl = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
  } else {
    // Try to extract project ref from the JWT secret's corresponding anon key
    // Fall back to the ref in the SUPABASE_JWT_SECRET env var context
    const ref = process.env.SUPABASE_PROJECT_REF ?? ''
    if (ref) {
      jwksUrl = `https://${ref}.supabase.co/auth/v1/.well-known/jwks.json`
    }
  }

  if (!jwksUrl) return null

  try {
    // Need apikey header for Supabase
    const anonKey = process.env.SUPABASE_ANON_KEY ?? ''
    const headers: Record<string, string> = {}
    if (anonKey) headers['apikey'] = anonKey

    const response = await fetch(jwksUrl, { headers })
    if (!response.ok) {
      console.error(`[auth] JWKS fetch failed: ${response.status}`)
      return null
    }

    const jwks = await response.json() as { keys: Array<Record<string, unknown>> }
    const es256Key = jwks.keys?.find((k) => k.alg === 'ES256' && k.kty === 'EC')
    if (!es256Key) {
      console.error('[auth] No ES256 key found in JWKS')
      return null
    }

    cachedPublicKey = crypto.createPublicKey({ key: es256Key as crypto.JsonWebKey, format: 'jwk' })
    jwksFetchedAt = Date.now()
    console.log('[auth] JWKS ES256 public key loaded successfully')
    return cachedPublicKey
  } catch (err) {
    console.error('[auth] JWKS fetch error:', err instanceof Error ? err.message : err)
    return null
  }
}

// Pre-fetch JWKS key on startup
void getJwksPublicKey()

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for public paths
  if (PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p))) {
    next()
    return
  }

  // Skip auth for WebSocket upgrade paths — these handle auth internally via JWT in query param
  // If Express middleware rejects the request, the server.on('upgrade') handler never fires.
  if (req.path.match(/^\/api\/browser-sessions\/[^/]+\/stream$/) && req.headers.upgrade?.toLowerCase() === 'websocket') {
    next()
    return
  }

  // Dev mode: no JWT secret configured — use a deterministic dev user
  // Only allow this bypass in development to prevent accidental production exposure
  if (!JWT_SECRET && process.env.NODE_ENV !== 'production') {
    req.user = { id: 'dev-user-local', email: 'dev@localhost' }
    next()
    return
  }

  // In production with no JWT secret, refuse all requests (misconfiguration)
  if (!JWT_SECRET) {
    res.status(500).json({ error: 'Server authentication not configured' })
    return
  }

  const authHeader = req.headers.authorization
  // Also support ?token= query param for SSE endpoints (EventSource can't send headers)
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null
  if (!authHeader?.startsWith('Bearer ') && !queryToken) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const token = queryToken || authHeader!.slice(7)

  // API key path — keys start with yk_live_
  if (token.startsWith('yk_live_')) {
    void validateApiKeyAuth(token, req, res, next)
    return
  }

  // Peek at the token header to determine algorithm
  const headerB64 = token.split('.')[0]
  let alg = 'HS256'
  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as { alg?: string }
    alg = header.alg ?? 'HS256'
  } catch {
    // If we can't decode header, try HS256
  }

  if (alg === 'ES256') {
    // Verify with JWKS public key (async)
    void verifyES256(token, req, res, next)
  } else {
    // Verify with shared secret (HS256)
    try {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload
      req.user = {
        id: payload.sub ?? '',
        email: (payload.email as string) ?? '',
      }
      next()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[auth] HS256 JWT verification failed: ${errMsg} | path=${req.path}`)
      res.status(401).json({ error: 'Invalid or expired token' })
    }
  }
}

async function validateApiKeyAuth(
  token: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!_apiKeyDb) {
    res.status(500).json({ error: 'API key validation not available' })
    return
  }

  const key = await validateApiKey(_apiKeyDb, token)
  if (!key) {
    res.status(401).json({ error: 'Invalid, revoked, or expired API key' })
    return
  }

  // Set user context from the API key creator
  req.user = {
    id: key.createdBy,
    email: '',
    activeTeamId: key.teamId,
    teamRole: 'member',
  }
  req.apiKey = key
  next()
}

/**
 * Standalone JWT verification for non-Express contexts (e.g. WebSocket upgrade).
 * Returns the authenticated user or null if verification fails.
 */
export async function verifyJwtToken(token: string): Promise<AuthUser | null> {
  // Dev mode bypass
  if (!JWT_SECRET && process.env.NODE_ENV !== 'production') {
    return { id: 'dev-user-local', email: 'dev@localhost' }
  }
  if (!JWT_SECRET) return null

  // Peek at algorithm
  const headerB64 = token.split('.')[0]
  let alg = 'HS256'
  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as { alg?: string }
    alg = header.alg ?? 'HS256'
  } catch { /* default to HS256 */ }

  try {
    if (alg === 'ES256') {
      const publicKey = await getJwksPublicKey()
      if (!publicKey) return null
      const payload = jwt.verify(token, publicKey, { algorithms: ['ES256'] }) as jwt.JwtPayload
      return { id: payload.sub ?? '', email: (payload.email as string) ?? '' }
    } else {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload
      return { id: payload.sub ?? '', email: (payload.email as string) ?? '' }
    }
  } catch {
    return null
  }
}

async function verifyES256(token: string, req: Request, res: Response, next: NextFunction): Promise<void> {
  const publicKey = await getJwksPublicKey()
  if (!publicKey) {
    console.error('[auth] ES256 token received but no JWKS public key available')
    res.status(401).json({ error: 'Server unable to verify token (JWKS unavailable)' })
    return
  }

  try {
    const payload = jwt.verify(token, publicKey, { algorithms: ['ES256'] }) as jwt.JwtPayload
    req.user = {
      id: payload.sub ?? '',
      email: (payload.email as string) ?? '',
    }
    next()
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[auth] ES256 JWT verification failed: ${errMsg} | path=${req.path}`)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
