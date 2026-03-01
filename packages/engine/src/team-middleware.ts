/**
 * team-middleware.ts — Team context resolver
 *
 * Reads X-Team-Id header, verifies the user is a member of that team,
 * and attaches the active team ID + role to the request.
 *
 * For routes under /api/teams/:id/..., the team ID can also be extracted
 * from the URL path when the header is not present.
 */

import type { Request, Response, NextFunction } from 'express'
import type { Db } from './db/types.ts'
import { getMember } from './teams.ts'

// Paths that don't require team context at all (no header or URL extraction needed)
const FULLY_EXEMPT_PATHS = [
  '/health',
  '/api/ollama',
  '/api/config',
  '/api/debug',
  '/api/notifications',
  '/api/user',
]

// UUID v4 regex for extracting team IDs from URL paths
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createTeamMiddleware(db: Db) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip fully exempt paths
    if (FULLY_EXEMPT_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
      next()
      return
    }

    // /api/teams exact path (list/create) — exempt, no team context needed
    if (req.path === '/api/teams') {
      next()
      return
    }

    // Try to get team ID from header first, or from ?teamId= query param (for SSE)
    let teamId = (req.headers['x-team-id'] as string | undefined)
      || (typeof req.query.teamId === 'string' ? req.query.teamId : undefined)

    // For /api/teams/:id/... routes, extract team ID from URL if header is missing
    if (!teamId) {
      const teamUrlMatch = req.path.match(/^\/api\/teams\/([^/]+)/)
      if (teamUrlMatch && teamUrlMatch[1]) {
        const urlTeamId = teamUrlMatch[1]
        // Only use URL team ID for deeper paths (e.g. /api/teams/:id/meetings/...)
        // For /api/teams/:id alone (GET team details), exempt without team context
        const afterId = req.path.slice(`/api/teams/${urlTeamId}`.length)
        if (!afterId || afterId === '/') {
          // /api/teams/:id — exempt (get/update/delete team)
          next()
          return
        }
        // /api/teams/:id/members — also exempt (team management)
        if (afterId === '/members' || afterId.startsWith('/members/')) {
          next()
          return
        }
        // /api/teams/:id/profile — also exempt (profile management during onboarding)
        if (afterId === '/profile' || afterId.startsWith('/profile/')) {
          next()
          return
        }
        // For deeper paths, use the URL team ID
        if (UUID_RE.test(urlTeamId)) {
          teamId = urlTeamId
        }
      }
    }

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
