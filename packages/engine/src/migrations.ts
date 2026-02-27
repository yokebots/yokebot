/**
 * migrations.ts — Versioned schema migration runner
 *
 * Manages incremental schema changes beyond the initial DDL.
 * Each migration runs exactly once, tracked via the schema_version table.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

interface Migration {
  version: number
  name: string
  up: (db: Db) => Promise<void>
}

/**
 * All migrations in order. Each runs exactly once.
 */
const migrations: Migration[] = [
  {
    version: 1,
    name: 'add_team_id_to_data_tables',
    async up(db: Db) {
      // Create a default team for existing data
      const defaultTeamId = randomUUID()

      if (db.driver === 'postgres') {
        // Insert default team
        await db.run(
          `INSERT INTO teams (id, name, created_at) VALUES ($1, $2, NOW())`,
          [defaultTeamId, 'Default Team'],
        )

        // Add team_id to 8 tables, backfill, set NOT NULL
        const tables = [
          'agents', 'messages', 'tasks', 'chat_messages',
          'chat_channels', 'approvals', 'sor_tables', 'activity_log',
        ]

        for (const table of tables) {
          await db.run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS team_id TEXT`)
          await db.run(`UPDATE ${table} SET team_id = $1 WHERE team_id IS NULL`, [defaultTeamId])
          await db.run(`ALTER TABLE ${table} ALTER COLUMN team_id SET NOT NULL`)
          await db.run(`ALTER TABLE ${table} ALTER COLUMN team_id SET DEFAULT ''`)
          await db.run(`CREATE INDEX IF NOT EXISTS idx_${table}_team ON ${table}(team_id)`)
        }

        // Update sor_tables unique constraint to include team_id
        await db.run(`ALTER TABLE sor_tables DROP CONSTRAINT IF EXISTS sor_tables_name_key`)
        await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sor_tables_team_name ON sor_tables(team_id, name)`)
      } else {
        // SQLite — can't ALTER COLUMN or SET NOT NULL, so add column + backfill
        // SQLite also can't do ADD COLUMN IF NOT EXISTS, so check first
        await db.run(
          `INSERT INTO teams (id, name, created_at) VALUES ($1, $2, datetime('now'))`,
          [defaultTeamId, 'Default Team'],
        )

        const tables = [
          'agents', 'messages', 'tasks', 'chat_messages',
          'chat_channels', 'approvals', 'sor_tables', 'activity_log',
        ]

        for (const table of tables) {
          // Check if column already exists
          const cols = await db.query<{ name: string }>(`PRAGMA table_info(${table})`)
          const hasTeamId = cols.some((c) => c.name === 'team_id')
          if (!hasTeamId) {
            await db.run(`ALTER TABLE ${table} ADD COLUMN team_id TEXT NOT NULL DEFAULT ''`)
          }
          await db.run(`UPDATE ${table} SET team_id = $1 WHERE team_id = '' OR team_id IS NULL`, [defaultTeamId])
          await db.run(`CREATE INDEX IF NOT EXISTS idx_${table}_team ON ${table}(team_id)`)
        }
      }
    },
  },
  {
    version: 2,
    name: 'add_model_id_to_agents',
    async up(db: Db) {
      // Add model_id column for logical model IDs
      if (db.driver === 'postgres') {
        await db.run('ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_id TEXT')
      } else {
        const cols = await db.query<{ name: string }>('PRAGMA table_info(agents)')
        if (!cols.some((c) => c.name === 'model_id')) {
          await db.run('ALTER TABLE agents ADD COLUMN model_id TEXT')
        }
      }

      // Backfill: map known (endpoint, model_name) pairs to logical model IDs
      const backfillMap: Array<{ endpoint: string; modelName: string; logicalId: string }> = [
        // DeepInfra models
        { endpoint: 'deepinfra', modelName: 'MiniMaxAI/MiniMax-M2.5', logicalId: 'minimax-m2.5' },
        { endpoint: 'deepinfra', modelName: 'Qwen/Qwen3.5-397B-A17B', logicalId: 'qwen-3.5' },
        { endpoint: 'deepinfra', modelName: 'moonshotai/Kimi-K2.5', logicalId: 'kimi-k2.5' },
        { endpoint: 'deepinfra', modelName: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', logicalId: 'llama-4-maverick' },
        { endpoint: 'deepinfra', modelName: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', logicalId: 'llama-4-scout' },
        { endpoint: 'deepinfra', modelName: 'meta-llama/Meta-Llama-3.1-70B-Instruct', logicalId: 'llama-4-maverick' },
        { endpoint: 'deepinfra', modelName: 'meta-llama/Meta-Llama-3.1-8B-Instruct', logicalId: 'llama-4-scout' },
        { endpoint: 'deepinfra', modelName: 'deepseek-ai/DeepSeek-R1', logicalId: 'deepseek-r1' },
        { endpoint: 'deepinfra', modelName: 'deepseek-ai/DeepSeek-V3', logicalId: 'deepseek-v3' },
        { endpoint: 'deepinfra', modelName: 'Qwen/Qwen2.5-72B-Instruct', logicalId: 'qwen-3.5' },
        // Together models → map to closest logical model
        { endpoint: 'together', modelName: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', logicalId: 'llama-4-maverick' },
        { endpoint: 'together', modelName: 'deepseek-ai/DeepSeek-R1', logicalId: 'deepseek-r1' },
        { endpoint: 'together', modelName: 'deepseek-ai/DeepSeek-V3', logicalId: 'deepseek-v3' },
        // OpenAI models → no longer in catalog, map to closest frontier
        { endpoint: 'openai', modelName: 'gpt-4o', logicalId: 'minimax-m2.5' },
        { endpoint: 'openai', modelName: 'gpt-4o-mini', logicalId: 'llama-4-scout' },
      ]

      for (const mapping of backfillMap) {
        await db.run(
          'UPDATE agents SET model_id = $1 WHERE model_endpoint = $2 AND model_name = $3 AND (model_id IS NULL OR model_id = \'\')',
          [mapping.logicalId, mapping.endpoint, mapping.modelName],
        )
      }

      // Default any remaining agents to llama-4-maverick
      await db.run(
        "UPDATE agents SET model_id = 'llama-4-maverick' WHERE model_id IS NULL OR model_id = ''",
      )
    },
  },
  {
    version: 3,
    name: 'add_attachments_to_chat_messages',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.run('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments TEXT')
      } else {
        const cols = await db.query<{ name: string }>('PRAGMA table_info(chat_messages)')
        if (!cols.some((c) => c.name === 'attachments')) {
          await db.run('ALTER TABLE chat_messages ADD COLUMN attachments TEXT')
        }
      }
    },
  },
  {
    version: 4,
    name: 'add_billing_tables',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS team_subscriptions (
            team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
            stripe_customer_id TEXT NOT NULL,
            stripe_subscription_id TEXT,
            tier TEXT NOT NULL DEFAULT 'none',
            status TEXT NOT NULL DEFAULT 'inactive',
            max_agents INTEGER NOT NULL DEFAULT 0,
            min_heartbeat_seconds INTEGER NOT NULL DEFAULT 3600,
            active_hours_start INTEGER NOT NULL DEFAULT 9,
            active_hours_end INTEGER NOT NULL DEFAULT 17,
            monthly_credits INTEGER NOT NULL DEFAULT 0,
            current_period_end TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS team_credits (
            team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
            balance INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS credit_transactions (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            type TEXT NOT NULL,
            description TEXT NOT NULL,
            stripe_payment_intent_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_credit_tx_team ON credit_transactions(team_id, created_at);
          CREATE INDEX IF NOT EXISTS idx_team_sub_stripe ON team_subscriptions(stripe_customer_id);
          CREATE INDEX IF NOT EXISTS idx_team_sub_stripe_sub ON team_subscriptions(stripe_subscription_id);
        `)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS team_subscriptions (
            team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
            stripe_customer_id TEXT NOT NULL,
            stripe_subscription_id TEXT,
            tier TEXT NOT NULL DEFAULT 'none',
            status TEXT NOT NULL DEFAULT 'inactive',
            max_agents INTEGER NOT NULL DEFAULT 0,
            min_heartbeat_seconds INTEGER NOT NULL DEFAULT 3600,
            active_hours_start INTEGER NOT NULL DEFAULT 9,
            active_hours_end INTEGER NOT NULL DEFAULT 17,
            monthly_credits INTEGER NOT NULL DEFAULT 0,
            current_period_end TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS team_credits (
            team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
            balance INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS credit_transactions (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            type TEXT NOT NULL,
            description TEXT NOT NULL,
            stripe_payment_intent_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE INDEX IF NOT EXISTS idx_credit_tx_team ON credit_transactions(team_id, created_at);
          CREATE INDEX IF NOT EXISTS idx_team_sub_stripe ON team_subscriptions(stripe_customer_id);
          CREATE INDEX IF NOT EXISTS idx_team_sub_stripe_sub ON team_subscriptions(stripe_subscription_id);
        `)
      }
    },
  },
  {
    version: 5,
    name: 'add_model_and_skill_credit_costs',
    async up(db: Db) {
      // --- model_credit_costs table ---
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS model_credit_costs (
            model_id TEXT PRIMARY KEY,
            credits_per_use INTEGER NOT NULL DEFAULT 0,
            model_type TEXT NOT NULL DEFAULT 'chat',
            star_intelligence INTEGER NOT NULL DEFAULT 3,
            star_power INTEGER NOT NULL DEFAULT 3,
            star_speed INTEGER NOT NULL DEFAULT 3,
            description TEXT NOT NULL DEFAULT '',
            tagline TEXT NOT NULL DEFAULT '',
            pros TEXT NOT NULL DEFAULT '[]',
            cons TEXT NOT NULL DEFAULT '[]',
            release_date TEXT,
            popularity INTEGER NOT NULL DEFAULT 50
          );

          CREATE TABLE IF NOT EXISTS skill_credit_costs (
            skill_name TEXT PRIMARY KEY,
            credits_per_use INTEGER NOT NULL DEFAULT 0
          );
        `)

        // Add included_credits and credits_reset_at to team_subscriptions
        await db.run(`ALTER TABLE team_subscriptions ADD COLUMN IF NOT EXISTS included_credits INTEGER NOT NULL DEFAULT 0`)
        await db.run(`ALTER TABLE team_subscriptions ADD COLUMN IF NOT EXISTS credits_reset_at TEXT`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS model_credit_costs (
            model_id TEXT PRIMARY KEY,
            credits_per_use INTEGER NOT NULL DEFAULT 0,
            model_type TEXT NOT NULL DEFAULT 'chat',
            star_intelligence INTEGER NOT NULL DEFAULT 3,
            star_power INTEGER NOT NULL DEFAULT 3,
            star_speed INTEGER NOT NULL DEFAULT 3,
            description TEXT NOT NULL DEFAULT '',
            tagline TEXT NOT NULL DEFAULT '',
            pros TEXT NOT NULL DEFAULT '[]',
            cons TEXT NOT NULL DEFAULT '[]',
            release_date TEXT,
            popularity INTEGER NOT NULL DEFAULT 50
          );

          CREATE TABLE IF NOT EXISTS skill_credit_costs (
            skill_name TEXT PRIMARY KEY,
            credits_per_use INTEGER NOT NULL DEFAULT 0
          );
        `)

        // Add included_credits and credits_reset_at to team_subscriptions (SQLite)
        const cols = await db.query<{ name: string }>('PRAGMA table_info(team_subscriptions)')
        if (!cols.some((c) => c.name === 'included_credits')) {
          await db.run('ALTER TABLE team_subscriptions ADD COLUMN included_credits INTEGER NOT NULL DEFAULT 0')
        }
        if (!cols.some((c) => c.name === 'credits_reset_at')) {
          await db.run('ALTER TABLE team_subscriptions ADD COLUMN credits_reset_at TEXT')
        }
      }

      // Seed LLM models
      const chatModels = [
        { id: 'gemma-3-27b', credits: 5, type: 'chat', si: 2, sp: 2, ss: 5, desc: 'Quick worker for simple repetitive tasks', tag: 'Fast intern', pros: '["Extremely fast","Dirt cheap"]', cons: '["Struggles with complex reasoning"]', date: '2025-03-12', pop: 40 },
        { id: 'llama-4-scout', credits: 8, type: 'chat', si: 3, sp: 2, ss: 4, desc: 'Reliable assistant for everyday tasks', tag: 'Dependable junior', pros: '["Fast","Affordable","Solid all-rounder"]', cons: '["Not great at multi-step planning"]', date: '2025-04-05', pop: 55 },
        { id: 'devstral-small', credits: 8, type: 'chat', si: 3, sp: 3, ss: 4, desc: 'Code specialist for technical work', tag: 'Junior developer', pros: '["Punches above weight on coding"]', cons: '["Weaker on non-technical tasks"]', date: '2025-05-20', pop: 35 },
        { id: 'gpt-4o-mini', credits: 15, type: 'chat', si: 3, sp: 3, ss: 4, desc: 'Smooth communicator for customer-facing work', tag: 'Professional communicator', pros: '["Polished output","Reliable"]', cons: '["Closed-source","Slightly pricier"]', date: '2024-07-18', pop: 80 },
        { id: 'llama-4-maverick', credits: 15, type: 'chat', si: 4, sp: 3, ss: 3, desc: 'Versatile workhorse for creative content', tag: 'Mid-level marketing hire', pros: '["Great creative writing","Strong reasoning"]', cons: '["Slower than budget models"]', date: '2025-04-05', pop: 65 },
        { id: 'grok-4-fast', credits: 15, type: 'chat', si: 4, sp: 3, ss: 5, desc: 'Speed demon for real-time high-volume tasks', tag: 'Fast-talking closer', pros: '["Blazing fast","Good reasoning"]', cons: '["Newer, less battle-tested"]', date: '2025-12-01', pop: 50 },
        { id: 'deepseek-v3.2', credits: 10, type: 'chat', si: 5, sp: 4, ss: 5, desc: 'Bargain genius — gold-medal reasoning at budget price', tag: 'Senior engineer at junior pay', pros: '["Dual chat+reasoning","Absurdly cheap"]', cons: '["Chinese company (data sensitivity)"]', date: '2025-12-01', pop: 90 },
        { id: 'minimax-m2.5', credits: 25, type: 'chat', si: 4, sp: 4, ss: 3, desc: 'Orchestrator for complex multi-step workflows', tag: 'Project manager', pros: '["Excellent task breakdown","Strong context handling"]', cons: '["Not the cheapest"]', date: '2025-06-01', pop: 60 },
        { id: 'devstral-2', credits: 40, type: 'chat', si: 5, sp: 4, ss: 3, desc: 'Senior developer for complex code and architecture', tag: 'Senior software engineer', pros: '["Beats Claude 3.5 on SWE-bench"]', cons: '["Expensive","Slower"]', date: '2025-09-15', pop: 45 },
        { id: 'glm-5', credits: 40, type: 'chat', si: 5, sp: 5, ss: 3, desc: 'Frontier powerhouse for research and agentic work', tag: 'Senior strategist', pros: '["200K context","MIT license","Near-Opus benchmarks"]', cons: '["Expensive","Newer"]', date: '2026-02-11', pop: 55 },
        { id: 'kimi-k2.5', credits: 50, type: 'chat', si: 5, sp: 4, ss: 3, desc: 'Deep thinker for research and long-document analysis', tag: 'Research analyst', pros: '["Strong reasoning","Good synthesis"]', cons: '["Expensive"]', date: '2025-07-01', pop: 50 },
        { id: 'qwen-3.5', credits: 75, type: 'chat', si: 5, sp: 5, ss: 3, desc: 'Ultimate brain for the hardest tasks', tag: 'VP-level hire', pros: '["Top-tier intelligence across the board"]', cons: '["Most expensive option"]', date: '2025-09-01', pop: 70 },
      ]

      // Seed media models
      const mediaModels = [
        { id: 'flux-schnell', credits: 5, type: 'image', si: 3, sp: 3, ss: 5, desc: 'Budget image generation — fast and cheap', tag: 'Quick sketch artist', pros: '["Very fast","Dirt cheap"]', cons: '["Lower quality than premium options"]', date: '2024-08-01', pop: 60 },
        { id: 'flux-2-dev', credits: 50, type: 'image', si: 4, sp: 4, ss: 4, desc: 'High-quality image generation at mid-range price', tag: 'Skilled illustrator', pros: '["Great quality-to-price ratio","Commercial license","LoRA support"]', cons: '["Not quite as sharp as premium options"]', date: '2025-01-15', pop: 70 },
        { id: 'seedream-5.0-lite', credits: 150, type: 'image', si: 5, sp: 5, ss: 4, desc: 'ByteDance image gen with built-in web search and reasoning', tag: 'Creative director with Google', pros: '["Web search for trending content","Multi-round editing","14 reference images"]', cons: '["Proprietary, API only"]', date: '2026-02-24', pop: 65 },
        { id: 'nano-banana-pro', credits: 200, type: 'image', si: 5, sp: 5, ss: 4, desc: 'Photorealistic image generation for brand content', tag: 'Professional photographer', pros: '["Photorealistic quality","Brand consistency","Best text rendering"]', cons: '["Most expensive image option"]', date: '2025-06-01', pop: 75 },
        { id: 'firered-image-edit', credits: 150, type: 'image', si: 4, sp: 5, ss: 3, desc: 'Instruction-based image editing — style, remove, overlay', tag: 'Photo retoucher', pros: '["Edit existing images with text instructions","Virtual try-on","Style transfer"]', cons: '["Editing only, not generation from scratch"]', date: '2026-02-14', pop: 50 },
        { id: 'kling-3.0', credits: 1500, type: 'video', si: 4, sp: 5, ss: 2, desc: 'High-fidelity 5-second video clips', tag: 'Video producer', pros: '["High quality video"]', cons: '["Very expensive","Slow"]', date: '2025-08-01', pop: 65 },
        { id: 'seedance-2.0', credits: 1500, type: 'video', si: 4, sp: 5, ss: 2, desc: 'Dance and motion video generation', tag: 'Motion designer', pros: '["Natural motion","Good quality"]', cons: '["Very expensive","Slow"]', date: '2025-09-01', pop: 40 },
        { id: 'hunyuan-3d-v2.1', credits: 80, type: '3d', si: 3, sp: 3, ss: 3, desc: 'Budget 3D model generation', tag: '3D modeler', pros: '["Affordable 3D"]', cons: '["Lower quality"]', date: '2025-05-01', pop: 35 },
        { id: 'hunyuan-3d-v3.1-pro', credits: 600, type: '3d', si: 5, sp: 5, ss: 2, desc: 'High-quality 3D model generation', tag: 'Senior 3D artist', pros: '["Excellent quality"]', cons: '["Expensive","Slow"]', date: '2025-10-01', pop: 30 },
      ]

      const allModels = [...chatModels, ...mediaModels]
      for (const m of allModels) {
        await db.run(
          `INSERT INTO model_credit_costs (model_id, credits_per_use, model_type, star_intelligence, star_power, star_speed, description, tagline, pros, cons, release_date, popularity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (model_id) DO NOTHING`,
          [m.id, m.credits, m.type, m.si, m.sp, m.ss, m.desc, m.tag, m.pros, m.cons, m.date, m.pop],
        )
      }

      // Seed skill credit costs
      const skills = [
        { name: 'web_search', credits: 10 },
        { name: 'web_scrape', credits: 10 },
        { name: 'email_send', credits: 1 },
        { name: 'lead_enrichment', credits: 350 },
        { name: 'slack_send_message', credits: 0 },
        { name: 'run_python', credits: 0 },
        { name: 'sheets_read', credits: 0 },
        { name: 'sheets_write', credits: 0 },
      ]

      for (const s of skills) {
        await db.run(
          `INSERT INTO skill_credit_costs (skill_name, credits_per_use) VALUES ($1, $2) ON CONFLICT (skill_name) DO NOTHING`,
          [s.name, s.credits],
        )
      }
    },
  },
  {
    version: 6,
    name: 'add_stt_audio_embedding_models',
    async up(db: Db) {
      const newModels = [
        { id: 'voxtral-mini-realtime', credits: 5, type: 'stt', si: 5, sp: 4, ss: 5, desc: 'Real-time streaming speech-to-text, <500ms latency, 13 languages', tag: 'Live transcriptionist', pros: '["Real-time <500ms latency","Beats Whisper, GPT-4o, Gemini","Apache 2.0 license"]', cons: '["13 languages (not 100+)","Newer model"]', date: '2026-02-01', pop: 85 },
        { id: 'ace-step', credits: 100, type: 'audio', si: 4, sp: 4, ss: 3, desc: 'AI music generation — full songs with lyrics, any genre', tag: 'In-house composer', pros: '["Full songs with lyrics","50+ languages","LoRA support"]', cons: '["Quality varies by seed","Vocal synthesis lacks nuance"]', date: '2026-01-28', pop: 55 },
        { id: 'mirelo-sfx', credits: 75, type: 'audio', si: 4, sp: 5, ss: 3, desc: 'Premium sound effects and foley — 70% win rate in blind tests', tag: 'Sound designer', pros: '["70%+ blind test win rate","Video-synced foley","a16z backed"]', cons: '["More expensive than alternatives","Newer service"]', date: '2025-12-01', pop: 60 },
        { id: 'qwen3-embedding-8b', credits: 1, type: 'embedding', si: 5, sp: 4, ss: 5, desc: 'MTEB #1 multilingual embeddings for semantic search and knowledge base', tag: 'Search indexer', pros: '["#1 on MTEB leaderboard","100+ languages","Dirt cheap"]', cons: '["Embedding only, not generative"]', date: '2025-06-01', pop: 75 },
        { id: 'qwen-multi-angles', credits: 150, type: 'image', si: 4, sp: 4, ss: 3, desc: 'Render any image from 96 camera angles — product photography, e-commerce', tag: 'Product photographer', pros: '["96 precise camera poses","3D-consistent renders","Great for e-commerce"]', cons: '["Angle control only, not general editing"]', date: '2025-11-01', pop: 45 },
        { id: 'kling-o3', credits: 2000, type: 'video', si: 5, sp: 5, ss: 2, desc: 'Omni video — editing, references, multi-shot + native audio & voice control', tag: 'Video director', pros: '["Edit existing videos with text","Character consistency","Native audio + voice"]', cons: '["Expensive","Slow (1-2 min/clip)"]', date: '2026-02-01', pop: 80 },
        { id: 'kling-2.6-pro', credits: 1200, type: 'video', si: 4, sp: 5, ss: 2, desc: 'Long-form video up to 2 minutes, 1080p/30fps, audio-synced', tag: 'Video producer', pros: '["Up to 2 minutes","Audio synced","1080p/30fps"]', cons: '["Expensive"]', date: '2025-12-01', pop: 65 },
        { id: 'wan-2.6', credits: 500, type: 'video', si: 4, sp: 4, ss: 3, desc: 'Alibaba open-source video gen — cheapest quality option, native audio', tag: 'Budget filmmaker', pros: '["Very affordable","Open source","Native audio","15s clips"]', cons: '["Lower quality than Kling"]', date: '2025-12-16', pop: 60 },
      ]

      for (const m of newModels) {
        await db.run(
          `INSERT INTO model_credit_costs (model_id, credits_per_use, model_type, star_intelligence, star_power, star_speed, description, tagline, pros, cons, release_date, popularity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (model_id) DO NOTHING`,
          [m.id, m.credits, m.type, m.si, m.sp, m.ss, m.desc, m.tag, m.pros, m.cons, m.date, m.pop],
        )
      }

      // Seed skill credit costs for new skills
      const newSkills = [
        { name: 'generate_music', credits: 100 },
        { name: 'generate_sound_fx', credits: 75 },
        { name: 'embed_text', credits: 1 },
        { name: 'render_video', credits: 50 },
      ]

      for (const s of newSkills) {
        await db.run(
          `INSERT INTO skill_credit_costs (skill_name, credits_per_use) VALUES ($1, $2) ON CONFLICT (skill_name) DO NOTHING`,
          [s.name, s.credits],
        )
      }
    },
  },
  {
    version: 7,
    name: 'add_knowledge_base_tables',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        // Enable pgvector extension
        await db.run('CREATE EXTENSION IF NOT EXISTS vector')

        await db.exec(`
          CREATE TABLE IF NOT EXISTS kb_documents (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            title TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            l0_summary TEXT,
            l1_overview TEXT,
            chunk_count INTEGER DEFAULT 0,
            error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS kb_chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            token_count INTEGER DEFAULT 0,
            embedding vector(4096),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS kb_memories (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            agent_id TEXT,
            content TEXT NOT NULL,
            source_channel_id TEXT,
            embedding vector(4096),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_kb_documents_team ON kb_documents(team_id);
          CREATE INDEX IF NOT EXISTS idx_kb_documents_status ON kb_documents(status);
          CREATE INDEX IF NOT EXISTS idx_kb_chunks_team ON kb_chunks(team_id);
          CREATE INDEX IF NOT EXISTS idx_kb_chunks_document ON kb_chunks(document_id);
          CREATE INDEX IF NOT EXISTS idx_kb_memories_team ON kb_memories(team_id);
          CREATE INDEX IF NOT EXISTS idx_kb_memories_agent ON kb_memories(agent_id);

          CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding ON kb_chunks USING hnsw (embedding vector_cosine_ops);
          CREATE INDEX IF NOT EXISTS idx_kb_memories_embedding ON kb_memories USING hnsw (embedding vector_cosine_ops);

          ALTER TABLE kb_documents ENABLE ROW LEVEL SECURITY;
          ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;
          ALTER TABLE kb_memories ENABLE ROW LEVEL SECURITY;
        `)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS kb_documents (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            title TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            l0_summary TEXT,
            l1_overview TEXT,
            chunk_count INTEGER DEFAULT 0,
            error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS kb_chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            token_count INTEGER DEFAULT 0,
            embedding TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS kb_memories (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            agent_id TEXT,
            content TEXT NOT NULL,
            source_channel_id TEXT,
            embedding TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE INDEX IF NOT EXISTS idx_kb_documents_team ON kb_documents(team_id);
          CREATE INDEX IF NOT EXISTS idx_kb_documents_status ON kb_documents(status);
          CREATE INDEX IF NOT EXISTS idx_kb_chunks_team ON kb_chunks(team_id);
          CREATE INDEX IF NOT EXISTS idx_kb_chunks_document ON kb_chunks(document_id);
          CREATE INDEX IF NOT EXISTS idx_kb_memories_team ON kb_memories(team_id);
          CREATE INDEX IF NOT EXISTS idx_kb_memories_agent ON kb_memories(agent_id);
        `)
      }
    },
  },
]

/**
 * Run all pending migrations.
 */
export async function runMigrations(db: Db): Promise<void> {
  // Ensure schema_version table exists
  if (db.driver === 'postgres') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  // Get current version
  const row = await db.queryOne<{ max_v: number | null }>(
    'SELECT MAX(version) as max_v FROM schema_version',
  )
  const currentVersion = row?.max_v ?? 0

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue

    console.log(`[migrations] Running migration ${migration.version}: ${migration.name}`)
    await migration.up(db)
    await db.run(
      'INSERT INTO schema_version (version, name) VALUES ($1, $2)',
      [migration.version, migration.name],
    )
    console.log(`[migrations] Completed migration ${migration.version}`)
  }
}
