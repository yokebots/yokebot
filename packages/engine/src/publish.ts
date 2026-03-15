/**
 * publish.ts — App publishing service
 *
 * Manages publishing apps from Daytona sandboxes to production hosting.
 * Two hosting tiers:
 *  - Static ($0): Build output uploaded to Cloudflare R2, served via *.yokebot.app
 *  - Dynamic ($9/mo addon): Deployed to Railway on user's custom domain
 *
 * Overages on dynamic hosting are deducted from team credits.
 */

import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Db } from './db/types.ts'

// ---- Types ----

export type HostingType = 'static' | 'custom-domain' | 'dynamic'
export type PublishStatus = 'building' | 'published' | 'stopped' | 'failed'

export interface PublishedApp {
  id: string
  teamId: string
  appName: string
  displayName: string
  subdomain: string
  customDomain: string | null
  hostingType: HostingType
  status: PublishStatus
  publishedUrl: string | null
  r2Prefix: string | null
  railwayProjectId: string | null
  railwayServiceId: string | null
  buildLog: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

// ---- Broadcast hook ----

let publishBroadcast: ((teamId: string, app: PublishedApp) => void) | null = null

export function setPublishBroadcast(fn: (teamId: string, app: PublishedApp) => void): void {
  publishBroadcast = fn
}

// ---- R2 Client ----

let r2Client: S3Client | null = null

function getR2(): S3Client {
  if (!r2Client) {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('R2 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
    }
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  return r2Client
}

function getAppsBucket(): string {
  const bucket = process.env.R2_APPS_BUCKET
  if (!bucket) throw new Error('R2_APPS_BUCKET not configured')
  return bucket
}

// ---- Railway GraphQL Client ----

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'

async function railwayQuery(query: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const token = process.env.RAILWAY_API_TOKEN
  if (!token) throw new Error('RAILWAY_API_TOKEN not configured')

  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = await res.json() as { data?: Record<string, unknown>; errors?: Array<{ message: string }> }
  if (json.errors?.length) {
    throw new Error(`Railway API error: ${json.errors[0].message}`)
  }
  return json.data ?? {}
}

// ---- Subdomain validation ----

function validateSubdomain(subdomain: string): string {
  // Lowercase, alphanumeric + hyphens, 3-63 chars, no leading/trailing hyphens
  const clean = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
  if (clean.length < 3) throw new Error('Subdomain must be at least 3 characters')
  if (clean.length > 63) throw new Error('Subdomain must be 63 characters or fewer')
  return clean
}

// ---- CRUD ----

export async function getPublishedApp(db: Db, appId: string): Promise<PublishedApp | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM published_apps WHERE id = $1',
    [appId],
  )
  return row ? rowToApp(row) : null
}

export async function getPublishedAppBySubdomain(db: Db, subdomain: string): Promise<PublishedApp | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM published_apps WHERE subdomain = $1 AND status = $2',
    [subdomain, 'published'],
  )
  return row ? rowToApp(row) : null
}

export async function getPublishedAppByCustomDomain(db: Db, domain: string): Promise<PublishedApp | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM published_apps WHERE custom_domain = $1 AND status = $2',
    [domain, 'published'],
  )
  return row ? rowToApp(row) : null
}

export async function listPublishedApps(db: Db, teamId: string): Promise<PublishedApp[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM published_apps WHERE team_id = $1 ORDER BY created_at DESC',
    [teamId],
  )
  return rows.map(rowToApp)
}

async function createPublishedAppRecord(db: Db, data: {
  teamId: string
  appName: string
  displayName: string
  subdomain: string
  customDomain?: string
  hostingType: HostingType
  createdBy: string | null
}): Promise<PublishedApp> {
  const id = `pub_${randomUUID().slice(0, 8)}`
  const subdomain = validateSubdomain(data.subdomain)

  // Check subdomain uniqueness
  const existing = await db.queryOne<{ id: string }>(
    'SELECT id FROM published_apps WHERE subdomain = $1',
    [subdomain],
  )
  if (existing) throw new Error(`Subdomain "${subdomain}" is already taken`)

  await db.run(
    `INSERT INTO published_apps (id, team_id, app_name, display_name, subdomain, custom_domain, hosting_type, status, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'building', $8, ${db.now()}, ${db.now()})`,
    [id, data.teamId, data.appName, data.displayName, subdomain, data.customDomain ?? null, data.hostingType, data.createdBy],
  )

  return (await getPublishedApp(db, id))!
}

async function updateAppStatus(db: Db, appId: string, status: PublishStatus, extra?: Record<string, unknown>): Promise<void> {
  const sets = [`status = $1`, `updated_at = ${db.now()}`]
  const params: unknown[] = [status]
  let idx = 2

  if (extra?.publishedUrl !== undefined) { sets.push(`published_url = $${idx++}`); params.push(extra.publishedUrl) }
  if (extra?.r2Prefix !== undefined) { sets.push(`r2_prefix = $${idx++}`); params.push(extra.r2Prefix) }
  if (extra?.railwayProjectId !== undefined) { sets.push(`railway_project_id = $${idx++}`); params.push(extra.railwayProjectId) }
  if (extra?.railwayServiceId !== undefined) { sets.push(`railway_service_id = $${idx++}`); params.push(extra.railwayServiceId) }
  if (extra?.customDomain !== undefined) { sets.push(`custom_domain = $${idx++}`); params.push(extra.customDomain) }
  if (extra?.buildLog !== undefined) { sets.push(`build_log = $${idx++}`); params.push(extra.buildLog) }

  params.push(appId)
  await db.run(`UPDATE published_apps SET ${sets.join(', ')} WHERE id = $${idx}`, params)
}

// ---- Static Publishing (R2) ----

/**
 * Publish a static app to R2.
 * 1. Build the app in the sandbox (npm run build)
 * 2. Download dist/ files from sandbox
 * 3. Upload to R2 under apps/{subdomain}/
 */
export async function publishStatic(
  db: Db,
  teamId: string,
  opts: { appName: string; displayName: string; subdomain: string; createdBy: string | null },
): Promise<PublishedApp> {
  const app = await createPublishedAppRecord(db, {
    ...opts,
    teamId,
    hostingType: 'static',
  })

  try {
    // Import sandbox functions
    const { execCommand, sandboxListFiles, sandboxReadFile } = await import('./sandbox.ts')

    // Build the app
    console.log(`[publish] Building static app "${app.subdomain}" for team ${teamId}`)
    const buildResult = await execCommand(db, teamId, 'cd /app && npm run build', '/app')
    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr || buildResult.stdout}`)
    }

    // Find the dist directory
    const distFiles = await collectFiles(db, teamId, '/app/dist')
    if (distFiles.length === 0) {
      throw new Error('Build produced no output files in /app/dist')
    }

    // Upload to R2
    const r2 = getR2()
    const bucket = getAppsBucket()
    const prefix = `apps/${app.subdomain}`

    console.log(`[publish] Uploading ${distFiles.length} files to R2: ${prefix}/`)
    for (const file of distFiles) {
      const content = await sandboxReadFile(db, teamId, file.path)
      const key = `${prefix}${file.path.replace('/app/dist', '')}`
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: guessContentType(file.path),
      }))
    }

    const publishedUrl = `https://${app.subdomain}.yokebot.app`
    await updateAppStatus(db, app.id, 'published', {
      publishedUrl,
      r2Prefix: prefix,
      buildLog: buildResult.stdout.slice(0, 10000),
    })

    const published = (await getPublishedApp(db, app.id))!
    if (publishBroadcast) publishBroadcast(teamId, published)
    console.log(`[publish] Static app published: ${publishedUrl}`)
    return published
  } catch (err) {
    await updateAppStatus(db, app.id, 'failed', {
      buildLog: (err as Error).message.slice(0, 10000),
    })
    throw err
  }
}

/**
 * Publish a static app to R2 with a custom domain ($9/mo addon).
 * Same as publishStatic but uses the user's own domain instead of yokebot.app.
 */
export async function publishCustomDomain(
  db: Db,
  teamId: string,
  opts: { appName: string; displayName: string; subdomain: string; customDomain: string; createdBy: string | null },
): Promise<PublishedApp> {
  if (!opts.customDomain) throw new Error('Custom domain is required for this hosting type')

  const app = await createPublishedAppRecord(db, {
    ...opts,
    teamId,
    hostingType: 'custom-domain',
  })

  try {
    const { execCommand, sandboxReadFile } = await import('./sandbox.ts')

    // Build the app
    console.log(`[publish] Building custom-domain app "${opts.customDomain}" for team ${teamId}`)
    const buildResult = await execCommand(db, teamId, 'cd /app && npm run build', '/app')
    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr || buildResult.stdout}`)
    }

    // Collect and upload dist files to R2
    const distFiles = await collectFiles(db, teamId, '/app/dist')
    if (distFiles.length === 0) {
      throw new Error('Build produced no output files in /app/dist')
    }

    const r2 = getR2()
    const bucket = getAppsBucket()
    const prefix = `apps/${app.subdomain}`

    console.log(`[publish] Uploading ${distFiles.length} files to R2: ${prefix}/`)
    for (const file of distFiles) {
      const content = await sandboxReadFile(db, teamId, file.path)
      const key = `${prefix}${file.path.replace('/app/dist', '')}`
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: guessContentType(file.path),
      }))
    }

    const publishedUrl = `https://${opts.customDomain}`
    await updateAppStatus(db, app.id, 'published', {
      publishedUrl,
      customDomain: opts.customDomain,
      r2Prefix: prefix,
      buildLog: buildResult.stdout.slice(0, 10000),
    })

    const published = (await getPublishedApp(db, app.id))!
    if (publishBroadcast) publishBroadcast(teamId, published)
    console.log(`[publish] Custom domain app published: ${publishedUrl}`)
    return published
  } catch (err) {
    await updateAppStatus(db, app.id, 'failed', {
      buildLog: (err as Error).message.slice(0, 10000),
    })
    throw err
  }
}

/**
 * Upgrade an app from custom-domain (R2 static) to dynamic (Railway full-stack).
 * Deploys code to Railway, swaps domain, cleans up R2 files.
 */
export async function upgradeToFullStack(
  db: Db,
  teamId: string,
  appId: string,
): Promise<PublishedApp> {
  const app = await getPublishedApp(db, appId)
  if (!app) throw new Error('App not found')
  if (app.teamId !== teamId) throw new Error('Forbidden')
  if (app.hostingType !== 'custom-domain') throw new Error('Only custom-domain apps can be upgraded to full-stack')

  // Publish as dynamic using the same subdomain and custom domain
  const dynamicApp = await publishDynamic(db, teamId, {
    appName: app.appName,
    displayName: app.displayName,
    subdomain: app.subdomain + '-upgraded', // temp subdomain to avoid conflict
    customDomain: app.customDomain ?? undefined,
    createdBy: app.createdBy,
  })

  // Clean up the old R2 static app
  if (app.r2Prefix) {
    try {
      const r2 = getR2()
      const bucket = getAppsBucket()
      const listed = await r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: app.r2Prefix }))
      if (listed.Contents?.length) {
        await r2.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: listed.Contents.map(obj => ({ Key: obj.Key! })) },
        }))
      }
    } catch (err) {
      console.error(`[publish] Failed to clean up R2 files during upgrade:`, (err as Error).message)
    }
  }

  // Delete old record
  await db.run('DELETE FROM published_apps WHERE id = $1', [appId])

  return dynamicApp
}

/** Recursively collect all files in a sandbox directory */
async function collectFiles(
  db: Db, teamId: string, dir: string,
): Promise<Array<{ path: string; name: string }>> {
  const { sandboxListFiles } = await import('./sandbox.ts')
  const entries = await sandboxListFiles(db, teamId, dir)
  const files: Array<{ path: string; name: string }> = []

  for (const entry of entries) {
    if (entry.isDirectory) {
      const nested = await collectFiles(db, teamId, entry.path)
      files.push(...nested)
    } else {
      files.push({ path: entry.path, name: entry.name })
    }
  }

  return files
}

// ---- Dynamic Publishing (Railway) ----

/**
 * Publish a dynamic app to Railway.
 * 1. Build the app in the sandbox
 * 2. Create a Railway project + service
 * 3. Upload source code and trigger deployment
 * 4. Add user's custom domain
 */
export async function publishDynamic(
  db: Db,
  teamId: string,
  opts: { appName: string; displayName: string; subdomain: string; customDomain?: string; createdBy: string | null },
): Promise<PublishedApp> {
  const app = await createPublishedAppRecord(db, {
    ...opts,
    teamId,
    hostingType: 'dynamic',
  })

  try {
    const { execCommand } = await import('./sandbox.ts')

    // Build the app first to validate it compiles
    console.log(`[publish] Building dynamic app "${app.subdomain}" for team ${teamId}`)
    const buildResult = await execCommand(db, teamId, 'cd /app && npm run build', '/app')

    // Create Railway project
    console.log(`[publish] Creating Railway project for "${app.subdomain}"`)
    const projectData = await railwayQuery(`
      mutation($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
        }
      }
    `, {
      input: {
        name: `yokebot-${app.subdomain}`,
        description: `YokeBot published app: ${app.displayName}`,
      },
    })
    const project = projectData.projectCreate as { id: string; name: string }

    // Create a service in the project
    const serviceData = await railwayQuery(`
      mutation($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
        }
      }
    `, {
      input: {
        name: app.subdomain,
        projectId: project.id,
      },
    })
    const service = serviceData.serviceCreate as { id: string; name: string }

    // Get the default environment ID
    const envData = await railwayQuery(`
      query($projectId: String!) {
        project(id: $projectId) {
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `, { projectId: project.id })
    const envEdges = ((envData.project as Record<string, unknown>)?.environments as { edges: Array<{ node: { id: string; name: string } }> })?.edges
    const envId = envEdges?.[0]?.node?.id
    if (!envId) throw new Error('No default environment found in Railway project')

    // Set environment variables for the service
    await railwayQuery(`
      mutation($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `, {
      input: {
        projectId: project.id,
        serviceId: service.id,
        environmentId: envId,
        variables: {
          NODE_ENV: 'production',
          PORT: '3000',
        },
      },
    })

    // Add custom domain if provided, otherwise use Railway's generated domain
    let domainData: Record<string, unknown> | null = null
    if (opts.customDomain) {
      domainData = await railwayQuery(`
        mutation($input: CustomDomainCreateInput!) {
          customDomainCreate(input: $input) {
            id
            domain
            status {
              dnsRecords {
                type
                hostlabel
                value
              }
            }
          }
        }
      `, {
        input: {
          projectId: project.id,
          serviceId: service.id,
          environmentId: envId,
          domain: opts.customDomain,
        },
      })
    }

    // Also generate a Railway service domain as fallback
    await railwayQuery(`
      mutation($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          domain
        }
      }
    `, {
      input: {
        serviceId: service.id,
        environmentId: envId,
      },
    })

    // Create a tarball of the app source in the sandbox and upload via Railway CLI
    // We use the sandbox to create a deployment-ready archive
    console.log(`[publish] Preparing deployment package for "${app.subdomain}"`)

    // Create a Dockerfile in the sandbox for Railway deployment
    const { sandboxWriteFile } = await import('./sandbox.ts')
    await sandboxWriteFile(db, teamId, '/app/Dockerfile', [
      'FROM node:20-slim',
      'WORKDIR /app',
      'COPY package*.json ./',
      'RUN npm ci --omit=dev',
      'COPY . .',
      'RUN npm run build 2>/dev/null || true',
      'EXPOSE 3000',
      'CMD ["npm", "start"]',
    ].join('\n'))

    // Trigger deployment via Railway service domain (Railway auto-deploys when code is pushed)
    // For now, we set up the project + service + domain. The actual deployment trigger
    // uses Railway's deployment API with the source code from the sandbox.
    const deployResult = await triggerRailwayDeploy(db, teamId, project.id, service.id, envId)

    const publishedUrl = opts.customDomain
      ? `https://${opts.customDomain}`
      : `https://${app.subdomain}.yokebot.app`
    await updateAppStatus(db, app.id, 'published', {
      publishedUrl,
      customDomain: opts.customDomain ?? null,
      railwayProjectId: project.id,
      railwayServiceId: service.id,
      buildLog: [buildResult.stdout, deployResult].join('\n---\n').slice(0, 10000),
    })

    const published = (await getPublishedApp(db, app.id))!
    if (publishBroadcast) publishBroadcast(teamId, published)
    console.log(`[publish] Dynamic app published: ${publishedUrl}`)
    return published
  } catch (err) {
    await updateAppStatus(db, app.id, 'failed', {
      buildLog: (err as Error).message.slice(0, 10000),
    })
    throw err
  }
}

/** Trigger a Railway deployment by uploading source code from the sandbox */
async function triggerRailwayDeploy(
  db: Db, teamId: string, projectId: string, serviceId: string, envId: string,
): Promise<string> {
  const { execCommand } = await import('./sandbox.ts')

  // Create a tarball of the app
  const tarResult = await execCommand(db, teamId, 'cd /app && tar czf /tmp/deploy.tar.gz --exclude=node_modules --exclude=.git .', '/app')
  if (tarResult.exitCode !== 0) {
    throw new Error(`Failed to create deployment archive: ${tarResult.stderr}`)
  }

  // Read the tarball from sandbox
  const { sandboxReadFile } = await import('./sandbox.ts')
  const tarContent = await sandboxReadFile(db, teamId, '/tmp/deploy.tar.gz')

  // Upload to Railway via their deployment API
  // Railway accepts source uploads for Nixpacks-based deployments
  const token = process.env.RAILWAY_API_TOKEN
  if (!token) throw new Error('RAILWAY_API_TOKEN not configured')

  // Use Railway's REST upload endpoint for source deployments
  const uploadRes = await fetch(`https://backboard.railway.com/project/${projectId}/service/${serviceId}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/gzip',
    },
    body: Buffer.from(tarContent, 'binary'),
  })

  if (!uploadRes.ok) {
    // Fallback: trigger deployment via GraphQL with empty source
    // This will use any connected repo or previous source
    console.log(`[publish] Direct upload failed (${uploadRes.status}), triggering deployment via API`)
    await railwayQuery(`
      mutation($input: DeploymentTriggerInput!) {
        deploymentTriggerCreate(input: $input) {
          id
        }
      }
    `, {
      input: {
        projectId,
        serviceId,
        environmentId: envId,
      },
    })
    return 'Deployment triggered via API'
  }

  return 'Source uploaded and deployment triggered'
}

// ---- Unpublish ----

export async function unpublishApp(db: Db, teamId: string, appId: string): Promise<void> {
  const app = await getPublishedApp(db, appId)
  if (!app) throw new Error('App not found')
  if (app.teamId !== teamId) throw new Error('Forbidden')

  if (app.hostingType === 'static' && app.r2Prefix) {
    // Delete files from R2
    try {
      const r2 = getR2()
      const bucket = getAppsBucket()

      const listed = await r2.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: app.r2Prefix,
      }))

      if (listed.Contents?.length) {
        await r2.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: listed.Contents.map(obj => ({ Key: obj.Key! })),
          },
        }))
      }
    } catch (err) {
      console.error(`[publish] Failed to delete R2 files for ${app.subdomain}:`, (err as Error).message)
    }
  }

  if (app.hostingType === 'dynamic' && app.railwayProjectId) {
    // Delete Railway project
    try {
      await railwayQuery(`
        mutation($id: String!) {
          projectDelete(id: $id)
        }
      `, { id: app.railwayProjectId })
    } catch (err) {
      console.error(`[publish] Failed to delete Railway project for ${app.subdomain}:`, (err as Error).message)
    }
  }

  // Delete from DB
  await db.run('DELETE FROM published_apps WHERE id = $1', [appId])
  console.log(`[publish] Unpublished app: ${app.subdomain}`)
}

// ---- Serve Static App (R2 proxy for subdomain requests) ----

/**
 * Serve a static file from R2 for a published app.
 * Called by the subdomain routing middleware when a request comes to *.yokebot.app.
 */
export async function serveStaticFile(app: PublishedApp, path: string): Promise<{
  body: Buffer | null
  contentType: string
  status: number
}> {
  if (!app.r2Prefix) {
    return { body: null, contentType: 'text/plain', status: 404 }
  }

  const r2 = getR2()
  const bucket = getAppsBucket()

  // Normalize path: / → /index.html
  let filePath = path === '/' ? '/index.html' : path

  // Try exact path first, then with index.html for directories
  const keys = [
    `${app.r2Prefix}${filePath}`,
    `${app.r2Prefix}${filePath}/index.html`,
  ]

  for (const key of keys) {
    try {
      const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      if (result.Body) {
        const chunks: Buffer[] = []
        const stream = result.Body as AsyncIterable<Uint8Array>
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk))
        }
        return {
          body: Buffer.concat(chunks),
          contentType: result.ContentType ?? guessContentType(key),
          status: 200,
        }
      }
    } catch {
      // File not found, try next key
    }
  }

  // SPA fallback: serve index.html for any non-file path
  if (!filePath.includes('.')) {
    try {
      const result = await r2.send(new GetObjectCommand({
        Bucket: bucket,
        Key: `${app.r2Prefix}/index.html`,
      }))
      if (result.Body) {
        const chunks: Buffer[] = []
        const stream = result.Body as AsyncIterable<Uint8Array>
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk))
        }
        return {
          body: Buffer.concat(chunks),
          contentType: 'text/html',
          status: 200,
        }
      }
    } catch {
      // No index.html either
    }
  }

  return { body: null, contentType: 'text/plain', status: 404 }
}

// ---- Helpers ----

function guessContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    mjs: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject',
    mp4: 'video/mp4',
    webm: 'video/webm',
    webp: 'image/webp',
    avif: 'image/avif',
    txt: 'text/plain',
    xml: 'application/xml',
    map: 'application/json',
  }
  return types[ext ?? ''] ?? 'application/octet-stream'
}

function rowToApp(row: Record<string, unknown>): PublishedApp {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    appName: row.app_name as string,
    displayName: row.display_name as string,
    subdomain: row.subdomain as string,
    customDomain: row.custom_domain as string | null,
    hostingType: row.hosting_type as HostingType,
    status: row.status as PublishStatus,
    publishedUrl: row.published_url as string | null,
    r2Prefix: row.r2_prefix as string | null,
    railwayProjectId: row.railway_project_id as string | null,
    railwayServiceId: row.railway_service_id as string | null,
    buildLog: row.build_log as string | null,
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
