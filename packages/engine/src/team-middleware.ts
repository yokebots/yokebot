/**
 * team-middleware.ts — Team context resolver
 *
 * Reads X-Team-Id header, verifies the user is a member of that team,
 * and attaches the active team ID + role to the request.
 */

import type { Request, Response, NextFunction } from 'express'
import type { Db } from './db/types.ts'
import { getMember } from './teams.ts'

// Paths that don't require team context
const EXEMPT_PATHS = [
  '/health',
  '/api/ollama',
  '/api/teams',
  '/api/notifications',
]

export function createTeamMiddleware(db: Db) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip for exempt paths
    if (EXEMPT_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
      next()
      return
    }

    const teamId = req.headers['x-team-id'] as string | undefined
    if (!teamId) {
      res.status(400).json({ error: 'X-Team-Id header is required' })
      return
    }

    // Verify user is a member of this team
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const member = await getMember(db, teamId, userId)
    if (!member) {
      res.status(403).json({ error: 'You are not a member of this team' })
      return
    }

    // Attach team context to the request
    req.user!.activeTeamId = teamId
    req.user!.teamRole = member.role

    next()
  }
}

/**
 * Helper to check if the user has the required role.
 * admin > member > viewer
 */
export function requireRole(req: Request, res: Response, minRole: 'admin' | 'member' | 'viewer'): boolean {
  const roleRank: Record<string, number> = { admin: 3, member: 2, viewer: 1 }
  const userRank = roleRank[req.user?.teamRole ?? ''] ?? 0
  const requiredRank = roleRank[minRole]
  if (userRank < requiredRank) {
    res.status(403).json({ error: `Requires ${minRole} role or higher` })
    return false
  }
  return true
}
