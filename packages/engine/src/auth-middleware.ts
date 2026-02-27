/**
 * auth-middleware.ts — JWT verification for Supabase auth
 *
 * Verifies the Bearer token from the dashboard against Supabase's
 * JWT secret. Attaches user info to the request object.
 */

import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthUser {
  id: string
  email: string
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? ''

// Paths that don't require authentication
const PUBLIC_PATHS = ['/health', '/api/ollama']

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for public paths
  if (PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p))) {
    next()
    return
  }

  // Skip auth if no JWT secret is configured (dev mode)
  if (!JWT_SECRET) {
    next()
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload
    req.user = {
      id: payload.sub ?? '',
      email: (payload.email as string) ?? '',
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
