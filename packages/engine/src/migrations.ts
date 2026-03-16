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
        { id: 'llama-4-maverick', credits: 15, type: 'chat', si: 4, sp: 3, ss: 3, desc: 'Versatile workhorse for creative content', tag: 'Mid-level marketing hire', pros: '["Great creative writing","Strong reasoning"]', cons: '["Slower than budget models"]', date: '2025-04-05', pop: 65 },
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

          -- Note: HNSW indexes limited to 2000 dimensions on Railway's pgvector.
          -- Qwen3 embeddings are 4096 dims, so we use exact nearest-neighbor search
          -- (operator class on the column enables <=> cosine distance without an index).
          -- At typical KB scale (<10K chunks per team) this is fast enough.

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
  {
    version: 8,
    name: 'credit_carryover_and_pricing_fixes',
    async up(db: Db) {
      // Add purchased_balance column to team_credits so purchased credit packs
      // carry over month-to-month while base included credits reset.
      if (db.driver === 'postgres') {
        await db.run('ALTER TABLE team_credits ADD COLUMN IF NOT EXISTS purchased_balance INTEGER NOT NULL DEFAULT 0')
      } else {
        const cols = await db.query<{ name: string }>('PRAGMA table_info(team_credits)')
        if (!cols.some((c) => c.name === 'purchased_balance')) {
          await db.run('ALTER TABLE team_credits ADD COLUMN purchased_balance INTEGER NOT NULL DEFAULT 0')
        }
      }

      // Fix credit pricing for models that were underwater or had wrong IDs.
      // Use UPDATE to overwrite values seeded in earlier migrations.
      const priceUpdates = [
        // flux-schnell: was 5, cost ~$0.003, now 10 → $0.005 revenue (40% margin)
        { id: 'flux-schnell', credits: 10 },
        // kling-o3: was 2000, cost ~$1.12/5s, now 3000 → $1.50 revenue (34% margin)
        { id: 'kling-o3', credits: 3000 },
        // kling-3.0: was 1500, cost ~$1.68/5s pro+audio, now 3500 → $1.75 revenue (4%... too thin)
        // Actually kling-3.0 at standard no-audio is $0.84/5s. Pro+audio is $1.68.
        // Keep at 2500 for standard usage = $1.25 revenue vs $0.84 cost = 33% margin
        { id: 'kling-3.0', credits: 2500 },
        // wan-2.6: was 500, cost ~$0.50-0.75/5s, now 2000 → $1.00 revenue (25-50% margin)
        { id: 'wan-2.6', credits: 2000 },
        // mirelo-sfx: was 75, cost ~$0.035/5s, now 120 → $0.06 revenue (42% margin)
        { id: 'mirelo-sfx', credits: 120 },
        // hunyuan-3d-v3.1-pro: already 600, cost ~$0.50, revenue $0.30 at $0.0005/credit — underwater
        // bump to 1200 → $0.60 revenue (17%... still thin. $0.50 cost * 1.3 = $0.65 = 1300 credits)
        { id: 'hunyuan-3d-v3.1-pro', credits: 1300 },
        // hunyuan-3d-v2.1: cost ~$0.10, was 80 credits ($0.04) — underwater
        // bump to 250 → $0.125 revenue (25% margin)
        { id: 'hunyuan-3d-v2.1', credits: 250 },
      ]

      for (const u of priceUpdates) {
        await db.run(
          'UPDATE model_credit_costs SET credits_per_use = $1 WHERE model_id = $2',
          [u.credits, u.id],
        )
      }
    },
  },
  {
    version: 9,
    name: 'add_contact_submissions_and_email_sequences',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS contact_submissions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS email_sequences (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            name TEXT NOT NULL,
            from_email TEXT NOT NULL DEFAULT '',
            steps JSONB NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS email_sequence_enrollments (
            id TEXT PRIMARY KEY,
            sequence_id TEXT NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL,
            contact_email TEXT NOT NULL,
            contact_name TEXT NOT NULL DEFAULT '',
            current_step INTEGER NOT NULL DEFAULT 0,
            next_send_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_email_sequences_team ON email_sequences(team_id);
          CREATE INDEX IF NOT EXISTS idx_email_enrollments_seq ON email_sequence_enrollments(sequence_id);
          CREATE INDEX IF NOT EXISTS idx_email_enrollments_team ON email_sequence_enrollments(team_id);
          CREATE INDEX IF NOT EXISTS idx_email_enrollments_pending ON email_sequence_enrollments(status, next_send_at);
        `)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS contact_submissions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS email_sequences (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            name TEXT NOT NULL,
            from_email TEXT NOT NULL DEFAULT '',
            steps TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS email_sequence_enrollments (
            id TEXT PRIMARY KEY,
            sequence_id TEXT NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL,
            contact_email TEXT NOT NULL,
            contact_name TEXT NOT NULL DEFAULT '',
            current_step INTEGER NOT NULL DEFAULT 0,
            next_send_at TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE INDEX IF NOT EXISTS idx_email_sequences_team ON email_sequences(team_id);
          CREATE INDEX IF NOT EXISTS idx_email_enrollments_seq ON email_sequence_enrollments(sequence_id);
          CREATE INDEX IF NOT EXISTS idx_email_enrollments_team ON email_sequence_enrollments(team_id);
          CREATE INDEX IF NOT EXISTS idx_email_enrollments_pending ON email_sequence_enrollments(status, next_send_at);
        `)
      }
    },
  },
  {
    version: 10,
    name: 'update_skill_credit_prices_and_add_tavily_scrape',
    async up(db: Db) {
      // Update skill credit costs to reflect real API costs with healthy margins
      const priceUpdates = [
        { name: 'web_search', credits: 25 },      // Brave: ~$0.005/query → 25 credits ($0.0125) = 60% margin
        { name: 'web_scrape', credits: 30 },       // Tavily: ~$0.008-0.016/extract → 30 credits ($0.015) = 38-69% margin
        { name: 'email_send', credits: 8 },        // Resend: ~$0.0009/email → 8 credits ($0.004) = 78% margin
      ]

      for (const u of priceUpdates) {
        await db.run(
          'UPDATE skill_credit_costs SET credits_per_use = $1 WHERE skill_name = $2',
          [u.credits, u.name],
        )
      }

      // Add scrape_webpage_firecrawl as a separate BYOK skill (0 credits — user pays Firecrawl directly)
      await db.run(
        `INSERT INTO skill_credit_costs (skill_name, credits_per_use) VALUES ($1, $2) ON CONFLICT (skill_name) DO NOTHING`,
        ['scrape_webpage_firecrawl', 30],
      )
    },
  },
  {
    version: 11,
    name: 'make_all_agents_proactive',
    async up(db: Db) {
      // All agents are now proactive by default — heartbeat frequency controls throttle
      await db.run('UPDATE agents SET proactive = 1 WHERE proactive = 0')
    },
  },
  {
    version: 12,
    name: 'add_channel_reads_table',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS channel_reads (
            user_id TEXT NOT NULL,
            channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
            last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, channel_id)
          );
          CREATE INDEX IF NOT EXISTS idx_channel_reads_user ON channel_reads(user_id);
          ALTER TABLE channel_reads ENABLE ROW LEVEL SECURITY;
        `)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS channel_reads (
            user_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, channel_id)
          );
        `)
      }
    },
  },
  {
    version: 13,
    name: 'add_additional_context_to_team_profiles',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.run('ALTER TABLE team_profiles ADD COLUMN IF NOT EXISTS additional_context TEXT')
      } else {
        const cols = await db.query<{ name: string }>('PRAGMA table_info(team_profiles)')
        if (!cols.some((c) => c.name === 'additional_context')) {
          await db.run('ALTER TABLE team_profiles ADD COLUMN additional_context TEXT')
        }
      }
    },
  },

  {
    version: 14,
    name: 'add_header_image_and_attachments_to_tasks',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.run("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS header_image TEXT")
        await db.run("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments TEXT DEFAULT '[]'")
      } else {
        const cols = await db.query<{ name: string }>('PRAGMA table_info(tasks)')
        if (!cols.some((c) => c.name === 'header_image')) {
          await db.run('ALTER TABLE tasks ADD COLUMN header_image TEXT')
        }
        if (!cols.some((c) => c.name === 'attachments')) {
          await db.run("ALTER TABLE tasks ADD COLUMN attachments TEXT DEFAULT '[]'")
        }
      }
    },
  },

  {
    version: 15,
    name: 'add_workflows',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            goal_id TEXT,
            trigger_type TEXT NOT NULL DEFAULT 'manual',
            schedule_cron TEXT,
            created_by TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS workflow_steps (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            step_order INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            assigned_agent_id TEXT,
            gate TEXT NOT NULL DEFAULT 'auto',
            timeout_minutes INTEGER,
            config TEXT NOT NULL DEFAULT '{}'
          );

          CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'running',
            current_step INTEGER NOT NULL DEFAULT 0,
            started_by TEXT NOT NULL DEFAULT '',
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            error TEXT
          );

          CREATE TABLE IF NOT EXISTS workflow_run_steps (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
            step_id TEXT NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
            task_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            error TEXT
          );

          CREATE INDEX IF NOT EXISTS idx_workflows_team ON workflows(team_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_team ON workflow_runs(team_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
          CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run ON workflow_run_steps(run_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_task ON workflow_run_steps(task_id);

          ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
          ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
          ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
          ALTER TABLE workflow_run_steps ENABLE ROW LEVEL SECURITY;
        `)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            goal_id TEXT,
            trigger_type TEXT NOT NULL DEFAULT 'manual',
            schedule_cron TEXT,
            created_by TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS workflow_steps (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            step_order INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            assigned_agent_id TEXT,
            gate TEXT NOT NULL DEFAULT 'auto',
            timeout_minutes INTEGER,
            config TEXT NOT NULL DEFAULT '{}'
          );

          CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'running',
            current_step INTEGER NOT NULL DEFAULT 0,
            started_by TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            error TEXT
          );

          CREATE TABLE IF NOT EXISTS workflow_run_steps (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
            step_id TEXT NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
            task_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at TEXT,
            completed_at TEXT,
            error TEXT
          );

          CREATE INDEX IF NOT EXISTS idx_workflows_team ON workflows(team_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_team ON workflow_runs(team_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
          CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run ON workflow_run_steps(run_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_task ON workflow_run_steps(task_id);
        `)
      }
    },
  },
  {
    version: 16,
    name: 'add_workflow_run_step_config',
    async up(db: Db) {
      // Add config column to workflow_run_steps for storing output variables
      if (db.driver === 'postgres') {
        await db.exec(`ALTER TABLE workflow_run_steps ADD COLUMN IF NOT EXISTS config TEXT NOT NULL DEFAULT '{}'`)
      } else {
        // SQLite doesn't support IF NOT EXISTS for ALTER TABLE
        try {
          await db.exec(`ALTER TABLE workflow_run_steps ADD COLUMN config TEXT NOT NULL DEFAULT '{}'`)
        } catch { /* column may already exist */ }
      }
    },
  },
  {
    version: 17,
    name: 'add_timezone_to_team_profiles',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`ALTER TABLE team_profiles ADD COLUMN IF NOT EXISTS timezone TEXT`)
      } else {
        try {
          await db.exec(`ALTER TABLE team_profiles ADD COLUMN timezone TEXT`)
        } catch { /* column may already exist */ }
      }
    },
  },
  {
    version: 18,
    name: 'add_conversation_summaries',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS conversation_summaries (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            summary TEXT NOT NULL,
            messages_summarized INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_conv_summaries_agent ON conversation_summaries(agent_id)`)
        await db.exec(`ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS conversation_summaries (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            summary TEXT NOT NULL,
            messages_summarized INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_conv_summaries_agent ON conversation_summaries(agent_id)`)
      }
    },
  },
  {
    version: 19,
    name: 'add_workspace_files_table',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS workspace_files (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            path TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            binary_content BYTEA,
            mime_type TEXT NOT NULL DEFAULT 'text/plain',
            size INTEGER NOT NULL DEFAULT 0,
            created_by TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_files_team_path ON workspace_files(team_id, path)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_files_team ON workspace_files(team_id)`)
        await db.exec(`ALTER TABLE workspace_files ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS workspace_files (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            path TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            binary_content BLOB,
            mime_type TEXT NOT NULL DEFAULT 'text/plain',
            size INTEGER NOT NULL DEFAULT 0,
            created_by TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(team_id, path)
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_files_team ON workspace_files(team_id)`)
      }
    },
  },
  {
    version: 20,
    name: 'remove_weak_models_add_sprint_tracking',
    async up(db: Db) {
      // Remove weak models from credit costs table
      await db.run(`DELETE FROM model_credit_costs WHERE model_id IN ('gemma-3-27b', 'llama-4-scout', 'devstral-small')`)

      // Add sprint attempt tracking column to tasks
      if (db.driver === 'postgres') {
        await db.run(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_count INTEGER NOT NULL DEFAULT 0`)
        await db.run(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_sprint_at TIMESTAMPTZ`)
      } else {
        await db.run(`ALTER TABLE tasks ADD COLUMN sprint_count INTEGER NOT NULL DEFAULT 0`)
        await db.run(`ALTER TABLE tasks ADD COLUMN last_sprint_at TEXT`)
      }
    },
  },
  {
    version: 21,
    name: 'workspace_threading_file_task_link_read_tracking',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        // 1. Add threading to chat_messages
        await db.run(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS parent_message_id INTEGER REFERENCES chat_messages(id)`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON chat_messages(parent_message_id)`)

        // 2. Add task linking to workspace_files
        await db.run(`ALTER TABLE workspace_files ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_workspace_files_task ON workspace_files(task_id)`)

        // 3. Track file reads (unread indicators)
        await db.exec(`
          CREATE TABLE IF NOT EXISTS workspace_file_reads (
            user_id TEXT NOT NULL,
            file_id TEXT NOT NULL REFERENCES workspace_files(id) ON DELETE CASCADE,
            last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, file_id)
          )
        `)
        await db.run(`ALTER TABLE workspace_file_reads ENABLE ROW LEVEL SECURITY`)

        // 4. Track task reads (unread indicators)
        await db.exec(`
          CREATE TABLE IF NOT EXISTS task_reads (
            user_id TEXT NOT NULL,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, task_id)
          )
        `)
        await db.run(`ALTER TABLE task_reads ENABLE ROW LEVEL SECURITY`)

        // 5. Add 'team' channel type — auto-created per team for the single team chat feed
        // No schema change needed: type column is TEXT, we just use 'team' as a new value
      } else {
        // SQLite equivalents
        await db.run(`ALTER TABLE chat_messages ADD COLUMN parent_message_id INTEGER REFERENCES chat_messages(id)`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON chat_messages(parent_message_id)`)

        await db.run(`ALTER TABLE workspace_files ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_workspace_files_task ON workspace_files(task_id)`)

        await db.exec(`
          CREATE TABLE IF NOT EXISTS workspace_file_reads (
            user_id TEXT NOT NULL,
            file_id TEXT NOT NULL REFERENCES workspace_files(id) ON DELETE CASCADE,
            last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, file_id)
          )
        `)

        await db.exec(`
          CREATE TABLE IF NOT EXISTS task_reads (
            user_id TEXT NOT NULL,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, task_id)
          )
        `)
      }
    },
  },
  {
    version: 22,
    name: 'tags_and_resource_tags',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6B7280',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(team_id, name)
          )
        `)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_tags_team ON tags(team_id)`)
        await db.run(`ALTER TABLE tags ENABLE ROW LEVEL SECURITY`)

        await db.exec(`
          CREATE TABLE IF NOT EXISTS resource_tags (
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            team_id TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (tag_id, resource_type, resource_id)
          )
        `)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_resource_tags_resource ON resource_tags(resource_type, resource_id)`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_resource_tags_team ON resource_tags(team_id)`)
        await db.run(`ALTER TABLE resource_tags ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6B7280',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(team_id, name)
          )
        `)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_tags_team ON tags(team_id)`)

        await db.exec(`
          CREATE TABLE IF NOT EXISTS resource_tags (
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            team_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (tag_id, resource_type, resource_id)
          )
        `)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_resource_tags_resource ON resource_tags(resource_type, resource_id)`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_resource_tags_team ON resource_tags(team_id)`)
      }
    },
  },

  {
    version: 23,
    name: 'onboarding_drips',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS onboarding_drips (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            team_id TEXT NOT NULL,
            email TEXT NOT NULL,
            series TEXT NOT NULL DEFAULT 'activation',
            tier_name TEXT,
            step INTEGER NOT NULL DEFAULT 0,
            next_send_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, team_id)
          )
        `)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_onboarding_drips_pending ON onboarding_drips(status, next_send_at)`)
        await db.run(`ALTER TABLE onboarding_drips ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS onboarding_drips (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            team_id TEXT NOT NULL,
            email TEXT NOT NULL,
            series TEXT NOT NULL DEFAULT 'activation',
            tier_name TEXT,
            step INTEGER NOT NULL DEFAULT 0,
            next_send_at TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, team_id)
          )
        `)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_onboarding_drips_pending ON onboarding_drips(status, next_send_at)`)
      }
    },
  },
  {
    version: 24,
    name: 'api_keys',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            created_by TEXT NOT NULL,
            name TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            scopes TEXT NOT NULL DEFAULT '*',
            last_used_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_team ON api_keys(team_id)`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`)
        await db.run(`ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            created_by TEXT NOT NULL,
            name TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            scopes TEXT NOT NULL DEFAULT '*',
            last_used_at TEXT,
            expires_at TEXT,
            revoked_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_team ON api_keys(team_id)`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`)
      }
    },
  },
  {
    version: 25,
    name: 'add_new_skill_credit_costs',
    async up(db: Db) {
      const newSkills = [
        { name: 'summarize_video', credits: 10 },
        { name: 'generate_captions', credits: 10 },
        { name: 'search_properties', credits: 5 },
        { name: 'search_companies', credits: 3 },
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
    version: 26,
    name: 'reprice_underwater_models_and_add_affordable_image_gen',
    async up(db: Db) {
      // ---- Fix underwater model credit costs ----
      // Power tier floor: $0.000298/credit. All prices verified against live provider pages March 2026.
      const modelUpdates = [
        { id: 'nano-banana-pro', credits: 600 },       // fal.ai $0.15/img → break-even 503, +19% Power margin
        { id: 'deepseek-v3.2', credits: 20 },           // DeepInfra $0.28/$0.88 → $0.00524/hb, break-even 18, +16% Power
        { id: 'glm-5', credits: 60 },                   // DeepInfra $0.80/$2.56 → $0.0152/hb, break-even 51, +15% Power
        { id: 'hunyuan-3d-v2.1', credits: 1200 },       // fal.ai $0.30/gen → break-even 1007, +16% Power
        { id: 'hunyuan-3d-v3.1-pro', credits: 2000 },   // fal.ai $0.375 base (+$0.15/option) → covers base + 1 option
        { id: 'kling-3.0', credits: 3000 },              // fal.ai $0.112-0.168/s × 5s = $0.56-0.84, +6-37% Power
        { id: 'kling-2.6-pro', credits: 3000 },          // fal.ai $0.07-0.168/s × 5s = $0.35-0.84, +6-62% Power
        { id: 'wan-2.6', credits: 3000 },                // fal.ai $0.10-0.15/s × 5s = $0.50-0.75, +16-44% Power
        { id: 'mirelo-sfx', credits: 250 },              // fal.ai $0.07 (1 sample 10s) → break-even 235, +6% Power
        { id: 'flux-schnell', credits: 15 },             // fal.ai $0.003/img → was 10 (break-even), +33% Power now
        { id: 'devstral-2', credits: 50 },               // $0.40/$2.00 → $0.0112/hb, was 40 (6% Power), +16% Power now
      ]
      for (const u of modelUpdates) {
        await db.run(
          'UPDATE model_credit_costs SET credits_per_use = $1 WHERE model_id = $2',
          [u.credits, u.id],
        )
      }

      // ---- Fix underwater skill credit costs ----
      const skillUpdates = [
        { name: 'search_companies', credits: 800 },     // Apollo ~$0.20/call → break-even 671, +16% Power
        { name: 'search_properties', credits: 40 },     // Firecrawl ~$0.005-0.01 → break-even 34, +16% Power
        { name: 'lead_enrichment', credits: 800 },      // Apollo ~$0.20 → break-even 671, +16% Power
        { name: 'web_scrape', credits: 55 },             // Tavily ~$0.016 worst case → break-even 54, +2% Power (was 30)
      ]
      for (const s of skillUpdates) {
        await db.run(
          'UPDATE skill_credit_costs SET credits_per_use = $1 WHERE skill_name = $2',
          [s.credits, s.name],
        )
      }

      // ---- Add new affordable image generation models ----
      const newModels = [
        { id: 'flux-2-klein', credits: 50, type: 'image', si: 3, sp: 3, ss: 5, desc: 'Ultra-cheap image gen — great for prototyping and batch work', tag: 'Quick sketch artist', pros: '["Absurdly cheap","Fast","Apache 2.0 license"]', cons: '["Lower quality than premium options","4B parameters"]', date: '2025-06-01', pop: 50 },
        { id: 'qwen-image-2.0', credits: 150, type: 'image', si: 4, sp: 4, ss: 4, desc: 'Affordable high-quality image gen + editing in one model', tag: 'Versatile designer', pros: '["Generation + editing in one model","Good quality","Affordable"]', cons: '["Newer model, less battle-tested"]', date: '2025-12-01', pop: 65 },
        { id: 'seedream-4.5', credits: 175, type: 'image', si: 4, sp: 4, ss: 4, desc: 'ByteDance mid-tier image gen — solid quality at a fair price', tag: 'Reliable illustrator', pros: '["Solid quality","Fair price","ByteDance ecosystem"]', cons: '["Not quite premium tier"]', date: '2025-10-01', pop: 60 },
      ]
      for (const m of newModels) {
        await db.run(
          `INSERT INTO model_credit_costs (model_id, credits_per_use, model_type, star_intelligence, star_power, star_speed, description, tagline, pros, cons, release_date, popularity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (model_id) DO NOTHING`,
          [m.id, m.credits, m.type, m.si, m.sp, m.ss, m.desc, m.tag, m.pros, m.cons, m.date, m.pop],
        )
      }
    },
  },
  {
    version: 27,
    name: 'add_nemotron_3_super',
    async up(db: Db) {
      await db.run(
        `INSERT INTO model_credit_costs (model_id, credits_per_use, model_type, star_intelligence, star_power, star_speed, description, tagline, pros, cons, release_date, popularity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (model_id) DO NOTHING`,
        [
          'nemotron-3-super',
          10,
          'chat',
          4,   // intelligence: strong benchmarks, slightly behind DeepSeek V3.2
          5,   // power: 1M context, 120B params, agentic training
          5,   // speed: 450 tok/s on DeepInfra, 12-40x faster than DeepSeek
          'NVIDIA agentic powerhouse — hybrid Mamba-Transformer MoE with 120B total / 12B active params, 1M context window, built for multi-step tool calling with 5x throughput',
          'Speed demon agent brain',
          '["12-40x faster than DeepSeek V3.2","1M token context window","Built for agentic tool calling","2x cheaper than DeepSeek","#1 on PinchBench (open models)","Open weights"]',
          '["5-10% behind DeepSeek V3.2 on raw benchmarks","Brand new (March 2026)","Smaller 12B active params"]',
          '2026-03-11',
          80,
        ],
      )
    },
  },
  {
    version: 28,
    name: 'reprice_nemotron_3_super_to_5_credits',
    async up(db: Db) {
      await db.run(
        `UPDATE model_credit_costs SET credits_per_use = 5 WHERE model_id = 'nemotron-3-super'`,
      )
    },
  },

  // --- Migration 29: Session Vault ---
  {
    version: 29,
    name: 'add_session_vault',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS session_vault (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            service_label TEXT NOT NULL,
            domain TEXT NOT NULL,
            encrypted_state TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            recorded_by TEXT NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMPTZ,
            last_verified_at TIMESTAMPTZ,
            use_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_session_vault_team ON session_vault(team_id);
          ALTER TABLE session_vault ENABLE ROW LEVEL SECURITY;

          CREATE TABLE IF NOT EXISTS session_vault_log (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES session_vault(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            agent_id TEXT,
            user_id TEXT,
            details TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_vault_log_session ON session_vault_log(session_id);
          ALTER TABLE session_vault_log ENABLE ROW LEVEL SECURITY;
        `)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS session_vault (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            service_label TEXT NOT NULL,
            domain TEXT NOT NULL,
            encrypted_state TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            recorded_by TEXT NOT NULL,
            recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_used_at TEXT,
            last_verified_at TEXT,
            use_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_session_vault_team ON session_vault(team_id);

          CREATE TABLE IF NOT EXISTS session_vault_log (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES session_vault(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            agent_id TEXT,
            user_id TEXT,
            details TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_vault_log_session ON session_vault_log(session_id);
        `)
      }
    },
  },

  // --- Migration 30: RLS policies for Session Vault ---
  {
    version: 30,
    name: 'add_session_vault_rls_policies',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE POLICY session_vault_team_isolation ON session_vault
            USING (team_id = current_setting('app.team_id', true))
            WITH CHECK (team_id = current_setting('app.team_id', true));

          CREATE POLICY session_vault_log_team_isolation ON session_vault_log
            USING (team_id = current_setting('app.team_id', true))
            WITH CHECK (team_id = current_setting('app.team_id', true));

          CREATE POLICY session_vault_service_role ON session_vault
            FOR ALL TO service_role USING (true) WITH CHECK (true);

          CREATE POLICY session_vault_log_service_role ON session_vault_log
            FOR ALL TO service_role USING (true) WITH CHECK (true);
        `)
      }
      // SQLite doesn't support RLS — no-op
    },
  },
  {
    version: 31,
    name: 'unify_blocked_approvals',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        // Add blocked_reason and blocked_approval_id to tasks
        await db.run(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason TEXT`)
        await db.run(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_approval_id TEXT`)

        // Add task_id to approvals (links approval back to its task)
        await db.run(`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS task_id TEXT`)
        await db.run(`CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id)`)

        // Backfill: existing blocked tasks get 'max_retries' as the reason
        await db.run(`UPDATE tasks SET blocked_reason = 'max_retries' WHERE status = 'blocked' AND blocked_reason IS NULL`)
      } else {
        // SQLite
        const taskCols = await db.query<{ name: string }>(`PRAGMA table_info(tasks)`)
        if (!taskCols.some(c => c.name === 'blocked_reason')) {
          await db.run(`ALTER TABLE tasks ADD COLUMN blocked_reason TEXT`)
        }
        if (!taskCols.some(c => c.name === 'blocked_approval_id')) {
          await db.run(`ALTER TABLE tasks ADD COLUMN blocked_approval_id TEXT`)
        }

        const approvalCols = await db.query<{ name: string }>(`PRAGMA table_info(approvals)`)
        if (!approvalCols.some(c => c.name === 'task_id')) {
          await db.run(`ALTER TABLE approvals ADD COLUMN task_id TEXT`)
        }
        await db.run(`CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id)`)

        // Backfill
        await db.run(`UPDATE tasks SET blocked_reason = 'max_retries' WHERE status = 'blocked' AND blocked_reason IS NULL`)
      }
    },
  },
  {
    version: 32,
    name: 'add_blocked_reason_text',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.run(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason_text TEXT`)
      } else {
        const cols = await db.query<{ name: string }>(`PRAGMA table_info(tasks)`)
        if (!cols.some(c => c.name === 'blocked_reason_text')) {
          await db.run(`ALTER TABLE tasks ADD COLUMN blocked_reason_text TEXT`)
        }
      }
    },
  },
  {
    version: 33,
    name: 'add_task_scratchpad',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.run(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scratchpad TEXT`)
      } else {
        const cols = await db.query<{ name: string }>(`PRAGMA table_info(tasks)`)
        if (!cols.some(c => c.name === 'scratchpad')) {
          await db.run(`ALTER TABLE tasks ADD COLUMN scratchpad TEXT`)
        }
      }
    },
  },
  {
    version: 34,
    name: 'add_plan_mode_and_estimated_credits',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.run(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_credits INTEGER`)
        await db.run(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS plan_mode BOOLEAN`) // null = use team default
        await db.run(`ALTER TABLE team_profiles ADD COLUMN IF NOT EXISTS plan_mode_default BOOLEAN DEFAULT true`)
      } else {
        const taskCols = await db.query<{ name: string }>(`PRAGMA table_info(tasks)`)
        if (!taskCols.some(c => c.name === 'estimated_credits')) {
          await db.run(`ALTER TABLE tasks ADD COLUMN estimated_credits INTEGER`)
        }
        const agentCols = await db.query<{ name: string }>(`PRAGMA table_info(agents)`)
        if (!agentCols.some(c => c.name === 'plan_mode')) {
          await db.run(`ALTER TABLE agents ADD COLUMN plan_mode INTEGER`) // null = use team default
        }
        const profileCols = await db.query<{ name: string }>(`PRAGMA table_info(team_profiles)`)
        if (!profileCols.some(c => c.name === 'plan_mode_default')) {
          await db.run(`ALTER TABLE team_profiles ADD COLUMN plan_mode_default INTEGER DEFAULT 1`)
        }
      }
    },
  },
  {
    version: 35,
    name: 'add_video_projects',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS video_projects (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            workflow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            settings TEXT NOT NULL DEFAULT '{}',
            created_by TEXT DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_projects_team ON video_projects(team_id)`)
        await db.exec(`ALTER TABLE video_projects ENABLE ROW LEVEL SECURITY`)

        await db.exec(`
          CREATE TABLE IF NOT EXISTS video_scenes (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
            scene_order INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL DEFAULT '',
            script_text TEXT DEFAULT '',
            image_prompt TEXT DEFAULT '',
            duration_ms INTEGER NOT NULL DEFAULT 5000,
            transition TEXT DEFAULT 'cut',
            scene_data TEXT NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_scenes_project ON video_scenes(project_id)`)
        await db.exec(`ALTER TABLE video_scenes ENABLE ROW LEVEL SECURITY`)

        await db.exec(`
          CREATE TABLE IF NOT EXISTS video_assets (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
            scene_id TEXT REFERENCES video_scenes(id) ON DELETE SET NULL,
            type TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'generated',
            file_path TEXT NOT NULL,
            filename TEXT DEFAULT '',
            duration_ms INTEGER,
            mime_type TEXT DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            track TEXT DEFAULT 'main',
            start_ms INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_assets_project ON video_assets(project_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_assets_scene ON video_assets(scene_id)`)
        await db.exec(`ALTER TABLE video_assets ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS video_projects (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            workflow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            settings TEXT NOT NULL DEFAULT '{}',
            created_by TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_projects_team ON video_projects(team_id)`)

        await db.exec(`
          CREATE TABLE IF NOT EXISTS video_scenes (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
            scene_order INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL DEFAULT '',
            script_text TEXT DEFAULT '',
            image_prompt TEXT DEFAULT '',
            duration_ms INTEGER NOT NULL DEFAULT 5000,
            transition TEXT DEFAULT 'cut',
            scene_data TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_scenes_project ON video_scenes(project_id)`)

        await db.exec(`
          CREATE TABLE IF NOT EXISTS video_assets (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
            scene_id TEXT REFERENCES video_scenes(id) ON DELETE SET NULL,
            type TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'generated',
            file_path TEXT NOT NULL,
            filename TEXT DEFAULT '',
            duration_ms INTEGER,
            mime_type TEXT DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            track TEXT DEFAULT 'main',
            start_ms INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_assets_project ON video_assets(project_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_assets_scene ON video_assets(scene_id)`)
      }
    },
  },
  {
    version: 36,
    name: 'add_nano_banana_2',
    async up(db: Db) {
      await db.run(
        `INSERT INTO model_credit_costs (model_id, credits_per_use, model_type, star_intelligence, star_power, star_speed, description, tagline, pros, cons, release_date, popularity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (model_id) DO NOTHING`,
        ['nano-banana-2', 100, 'image', 5, 5, 5,
          'Pro-quality image gen at Flash speed — excellent text rendering, character consistency, native 4K',
          'Fast creative director',
          '["Pro-quality at half the price","Best-in-class text rendering","Character consistency","Native 4K","Fast (5-10s)"]',
          '["Slightly less refined than Pro on complex scenes"]',
          '2026-02-26', 85],
      )
    },
  },
  {
    version: 37,
    name: 'security_hardening_rls',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        // Enable RLS on tables that were missing it
        await db.run(`ALTER TABLE IF EXISTS contact_submissions ENABLE ROW LEVEL SECURITY`)
        await db.run(`ALTER TABLE IF EXISTS email_sequences ENABLE ROW LEVEL SECURITY`)
        await db.run(`ALTER TABLE IF EXISTS email_sequence_enrollments ENABLE ROW LEVEL SECURITY`)
        await db.run(`ALTER TABLE IF EXISTS approvals ENABLE ROW LEVEL SECURITY`)
      }
    },
  },
  {
    version: 38,
    name: 'add_memory_nodes_and_noop',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        // memory_nodes table — DAG-based hierarchical conversation memory
        await db.exec(`
          CREATE TABLE IF NOT EXISTS memory_nodes (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            parent_id TEXT REFERENCES memory_nodes(id) ON DELETE SET NULL,
            depth INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL,
            msg_start_id BIGINT,
            msg_end_id BIGINT,
            msg_count INTEGER NOT NULL DEFAULT 0,
            child_ids TEXT,
            token_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_nodes_agent ON memory_nodes(agent_id, depth)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_nodes_team ON memory_nodes(team_id, agent_id)`)
        await db.exec(`ALTER TABLE memory_nodes ENABLE ROW LEVEL SECURITY`)

        // Add is_noop to messages
        try {
          await db.run(`ALTER TABLE messages ADD COLUMN is_noop BOOLEAN NOT NULL DEFAULT FALSE`)
        } catch { /* column may already exist */ }

        // Migrate existing conversation_summaries into memory_nodes as depth-0 nodes
        const existing = await db.query<{ id: string; team_id: string; agent_id: string; summary: string; messages_summarized: number; created_at: string }>(
          `SELECT id, team_id, agent_id, summary, messages_summarized, created_at FROM conversation_summaries`,
        )
        for (const row of existing) {
          await db.run(
            `INSERT INTO memory_nodes (id, team_id, agent_id, parent_id, depth, summary, msg_start_id, msg_end_id, msg_count, child_ids, token_count, created_at)
             VALUES ($1, $2, $3, NULL, 0, $4, NULL, NULL, $5, NULL, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [row.id, row.team_id, row.agent_id, row.summary, row.messages_summarized, Math.ceil(row.summary.length / 4), row.created_at],
          )
        }
        if (existing.length > 0) {
          console.log(`[migrations] Migrated ${existing.length} conversation_summaries → memory_nodes`)
        }
      } else {
        // SQLite
        await db.exec(`
          CREATE TABLE IF NOT EXISTS memory_nodes (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            parent_id TEXT REFERENCES memory_nodes(id) ON DELETE SET NULL,
            depth INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL,
            msg_start_id INTEGER,
            msg_end_id INTEGER,
            msg_count INTEGER NOT NULL DEFAULT 0,
            child_ids TEXT,
            token_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_nodes_agent ON memory_nodes(agent_id, depth)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_nodes_team ON memory_nodes(team_id, agent_id)`)

        // Add is_noop to messages
        try {
          await db.exec(`ALTER TABLE messages ADD COLUMN is_noop INTEGER NOT NULL DEFAULT 0`)
        } catch { /* column may already exist */ }

        // Migrate existing conversation_summaries
        try {
          const existing = await db.query<{ id: string; team_id: string; agent_id: string; summary: string; messages_summarized: number; created_at: string }>(
            `SELECT id, team_id, agent_id, summary, messages_summarized, created_at FROM conversation_summaries`,
          )
          for (const row of existing) {
            await db.run(
              `INSERT OR IGNORE INTO memory_nodes (id, team_id, agent_id, parent_id, depth, summary, msg_start_id, msg_end_id, msg_count, child_ids, token_count, created_at)
               VALUES ($1, $2, $3, NULL, 0, $4, NULL, NULL, $5, NULL, $6, $7)`,
              [row.id, row.team_id, row.agent_id, row.summary, row.messages_summarized, Math.ceil(row.summary.length / 4), row.created_at],
            )
          }
        } catch { /* conversation_summaries may not exist */ }
      }
    },
  },
  {
    version: 39,
    name: 'add_sandbox_sessions',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS sandbox_sessions (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL UNIQUE,
            daytona_sandbox_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            preview_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_team ON sandbox_sessions(team_id)`)
        await db.exec(`ALTER TABLE sandbox_sessions ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS sandbox_sessions (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL UNIQUE,
            daytona_sandbox_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            preview_url TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_activity TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
      }
    },
  },
  {
    version: 40,
    name: 'add_published_apps',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS published_apps (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            app_name TEXT NOT NULL,
            display_name TEXT NOT NULL,
            subdomain TEXT NOT NULL UNIQUE,
            custom_domain TEXT,
            hosting_type TEXT NOT NULL DEFAULT 'static',
            status TEXT NOT NULL DEFAULT 'building',
            published_url TEXT,
            r2_prefix TEXT,
            railway_project_id TEXT,
            railway_service_id TEXT,
            build_log TEXT,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_published_apps_team ON published_apps(team_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_published_apps_subdomain ON published_apps(subdomain)`)
        await db.exec(`ALTER TABLE published_apps ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS published_apps (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            app_name TEXT NOT NULL,
            display_name TEXT NOT NULL,
            subdomain TEXT NOT NULL UNIQUE,
            custom_domain TEXT,
            hosting_type TEXT NOT NULL DEFAULT 'static',
            status TEXT NOT NULL DEFAULT 'building',
            published_url TEXT,
            r2_prefix TEXT,
            railway_project_id TEXT,
            railway_service_id TEXT,
            build_log TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
      }
    },
  },
  {
    version: 41,
    name: 'add_skill_runs_and_versioning',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS skill_runs (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            agent_id TEXT NOT NULL,
            skill_name TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            user_feedback TEXT,
            args_preview TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`
          CREATE TABLE IF NOT EXISTS skill_versions (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            skill_name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            content TEXT NOT NULL,
            diff_from_previous TEXT,
            change_description TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            suggested_by_agent_id TEXT,
            approved_by_user_id TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(team_id, skill_name, version)
          )
        `)
        await db.exec(`
          CREATE TABLE IF NOT EXISTS skill_improvement_proposals (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            skill_name TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            proposed_content TEXT NOT NULL,
            reasoning TEXT NOT NULL,
            failure_run_ids TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by TEXT,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        // Indexes
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_runs_team ON skill_runs(team_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_runs_skill ON skill_runs(team_id, skill_name)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_runs_agent ON skill_runs(agent_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_runs_created ON skill_runs(team_id, created_at)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_versions_team_skill ON skill_versions(team_id, skill_name)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_proposals_team ON skill_improvement_proposals(team_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_proposals_status ON skill_improvement_proposals(team_id, status)`)
        // RLS
        await db.exec(`ALTER TABLE skill_runs ENABLE ROW LEVEL SECURITY`)
        await db.exec(`ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY`)
        await db.exec(`ALTER TABLE skill_improvement_proposals ENABLE ROW LEVEL SECURITY`)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS skill_runs (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            agent_id TEXT NOT NULL,
            skill_name TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            user_feedback TEXT,
            args_preview TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
        await db.exec(`
          CREATE TABLE IF NOT EXISTS skill_versions (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            skill_name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            content TEXT NOT NULL,
            diff_from_previous TEXT,
            change_description TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            suggested_by_agent_id TEXT,
            approved_by_user_id TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(team_id, skill_name, version)
          )
        `)
        await db.exec(`
          CREATE TABLE IF NOT EXISTS skill_improvement_proposals (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL DEFAULT '',
            skill_name TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            proposed_content TEXT NOT NULL,
            reasoning TEXT NOT NULL,
            failure_run_ids TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by TEXT,
            reviewed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_runs_team ON skill_runs(team_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_runs_skill ON skill_runs(team_id, skill_name)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_runs_agent ON skill_runs(agent_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_runs_created ON skill_runs(team_id, created_at)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_versions_team_skill ON skill_versions(team_id, skill_name)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_proposals_team ON skill_improvement_proposals(team_id)`)
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_proposals_status ON skill_improvement_proposals(team_id, status)`)
      }
    },
  },
  {
    version: 42,
    name: 'add_sandbox_startup_command',
    async up(db: Db) {
      await db.exec(`ALTER TABLE sandbox_sessions ADD COLUMN IF NOT EXISTS startup_command TEXT`)
    },
  },
  {
    version: 43,
    name: 'seed_new_model_credit_costs',
    async up(db: Db) {
      // Add credit costs for 5 new models added to MODEL_CATALOG
      // Pricing: Qwen 3.5 9B = 3, Step 3.5 Flash = 5, Mercury 2 = 8, Grok 4.1 Fast = 8, Qwen 3.5 27B = 15
      const newModels = [
        { id: 'qwen-3.5-9b', credits: 3, type: 'chat', si: 3, sp: 3, ss: 5, desc: 'Budget powerhouse — 80% cheaper than DeepSeek V3.2, great for simple agent tasks', tag: 'Cheapest workhorse', pros: '["80% cheaper than DeepSeek V3.2","262K context","Apache 2.0 license","Fast inference"]', cons: '["9B params limits complex reasoning","Tool calling unproven at this scale"]', date: '2026-03-01', pop: 50 },
        { id: 'qwen-3.5-27b', credits: 15, type: 'chat', si: 5, sp: 4, ss: 4, desc: 'Strong coder and reasoner — SWE-bench 72.4, 262K context, Apache 2.0, cheaper than DeepSeek V3.2', tag: 'Mid-level coding ace', pros: '["SWE-bench 72.4 (matches GPT-5 mini)","262K context","Apache 2.0","25% cheaper than DS V3.2"]', cons: '["Expensive output tokens ($1.56/M)","Slower than MoE models"]', date: '2026-02-24', pop: 65 },
        { id: 'step-3.5-flash', credits: 5, type: 'chat', si: 4, sp: 4, ss: 5, desc: 'Best price-to-performance — 66% cheaper than DS V3.2, faster, 256K context, strong tool calling', tag: 'Budget all-star', pros: '["Better benchmarks than DeepSeek V3.2","66% cheaper","148 tps","256K context","Open weights"]', cons: '["Less established provider","Chinese lab"]', date: '2026-02-15', pop: 60 },
        { id: 'mercury-2', credits: 8, type: 'chat', si: 3, sp: 3, ss: 5, desc: 'Speed king — 1000 tokens/sec, diffusion-based architecture, great for real-time interactions', tag: 'Speed demon', pros: '["1000 tps — 10x faster than traditional models","Great for real-time/voice agents"]', cons: '["Lower benchmarks than DS V3.2","New architecture (diffusion LLM)","Limited providers"]', date: '2026-01-15', pop: 45 },
        { id: 'grok-4.1-fast', credits: 8, type: 'chat', si: 3, sp: 4, ss: 4, desc: 'xAI agentic model — 2M context window, optimized for tool calling', tag: 'Long context specialist', pros: '["2M token context window","Good tool calling","33% cheaper than DS V3.2"]', cons: '["Below DS V3.2 on non-reasoning benchmarks","Proprietary"]', date: '2026-02-01', pop: 55 },
      ]

      for (const m of newModels) {
        await db.run(
          `INSERT INTO model_credit_costs (model_id, credits_per_use, model_type, star_intelligence, star_power, star_speed, description, tagline, pros, cons, release_date, popularity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (model_id) DO NOTHING`,
          [m.id, m.credits, m.type, m.si, m.sp, m.ss, m.desc, m.tag, m.pros, m.cons, m.date, m.pop],
        )
      }
    },
  },
  {
    version: 44,
    name: 'create_brand_kits_table',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS brand_kits (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL UNIQUE,
            primary_color TEXT NOT NULL DEFAULT '#3b82f6',
            secondary_color TEXT NOT NULL DEFAULT '#10b981',
            accent_color TEXT NOT NULL DEFAULT '#f59e0b',
            background_color TEXT NOT NULL DEFAULT '#ffffff',
            surface_color TEXT NOT NULL DEFAULT '#f8fafc',
            text_color TEXT NOT NULL DEFAULT '#1e293b',
            heading_font TEXT NOT NULL DEFAULT 'Inter',
            body_font TEXT NOT NULL DEFAULT 'Inter',
            base_font_size TEXT NOT NULL DEFAULT '16px',
            heading_style TEXT NOT NULL DEFAULT 'bold',
            border_radius TEXT NOT NULL DEFAULT '8px',
            spacing_scale TEXT NOT NULL DEFAULT 'comfortable',
            button_style TEXT NOT NULL DEFAULT 'rounded',
            card_style TEXT NOT NULL DEFAULT 'elevated',
            preset TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.exec(`ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY`)
        await db.exec(`
          CREATE POLICY brand_kits_all ON brand_kits
            FOR ALL
            USING (true)
            WITH CHECK (true)
        `)
      } else {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS brand_kits (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL UNIQUE,
            primary_color TEXT NOT NULL DEFAULT '#3b82f6',
            secondary_color TEXT NOT NULL DEFAULT '#10b981',
            accent_color TEXT NOT NULL DEFAULT '#f59e0b',
            background_color TEXT NOT NULL DEFAULT '#ffffff',
            surface_color TEXT NOT NULL DEFAULT '#f8fafc',
            text_color TEXT NOT NULL DEFAULT '#1e293b',
            heading_font TEXT NOT NULL DEFAULT 'Inter',
            body_font TEXT NOT NULL DEFAULT 'Inter',
            base_font_size TEXT NOT NULL DEFAULT '16px',
            heading_style TEXT NOT NULL DEFAULT 'bold',
            border_radius TEXT NOT NULL DEFAULT '8px',
            spacing_scale TEXT NOT NULL DEFAULT 'comfortable',
            button_style TEXT NOT NULL DEFAULT 'rounded',
            card_style TEXT NOT NULL DEFAULT 'elevated',
            preset TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
      }
    },
  },
  {
    version: 45,
    name: 'add_missing_rls_to_billing_tables',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        // These tables were created in migrations 4 and 5 without RLS.
        // Supabase exposes public schema via PostgREST — without RLS anyone can read/write.
        await db.run('ALTER TABLE IF EXISTS team_subscriptions ENABLE ROW LEVEL SECURITY')
        await db.run('ALTER TABLE IF EXISTS team_credits ENABLE ROW LEVEL SECURITY')
        await db.run('ALTER TABLE IF EXISTS credit_transactions ENABLE ROW LEVEL SECURITY')
        await db.run('ALTER TABLE IF EXISTS model_credit_costs ENABLE ROW LEVEL SECURITY')
        await db.run('ALTER TABLE IF EXISTS skill_credit_costs ENABLE ROW LEVEL SECURITY')
      }
      // SQLite does not have RLS — no-op
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
