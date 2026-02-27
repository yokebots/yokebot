/**
 * state.ts — Schema migrations for SQLite and Postgres
 *
 * All YokeBot state lives here: agents, conversations, tasks, chat,
 * approvals, source-of-record tables, and workspace metadata.
 * Supports both SQLite (local) and Postgres (hosted cloud).
 *
 * Every data table has a team_id column for multi-tenancy isolation.
 */

import type { Db } from './db/types.ts'

const SQLITE_DDL = `
  -- Teams (must come first — referenced by team_id FKs)
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Team members
  CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (team_id, user_id)
  );

  -- Agents table
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stopped',
    department TEXT,
    icon_name TEXT,
    icon_color TEXT,
    model_id TEXT,
    model_endpoint TEXT,
    model_name TEXT,
    system_prompt TEXT,
    proactive INTEGER NOT NULL DEFAULT 0,
    heartbeat_seconds INTEGER NOT NULL DEFAULT 3600,
    active_hours_start INTEGER DEFAULT 9,
    active_hours_end INTEGER DEFAULT 17,
    template_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Conversations / message history per agent
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Tasks (Mission Control)
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'medium',
    assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    deadline TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Task dependencies
  CREATE TABLE IF NOT EXISTS task_deps (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on)
  );

  -- Chat messages (built-in chat: DMs, task threads, group channels)
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL DEFAULT '',
    channel_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Chat channels
  CREATE TABLE IF NOT EXISTS chat_channels (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'group',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Approval queue
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    action_detail TEXT NOT NULL,
    risk_level TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  -- Source of record: dynamic tables registry
  CREATE TABLE IF NOT EXISTS sor_tables (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(team_id, name)
  );

  -- Source of record: column definitions
  CREATE TABLE IF NOT EXISTS sor_columns (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES sor_tables(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    col_type TEXT NOT NULL DEFAULT 'text',
    position INTEGER NOT NULL DEFAULT 0
  );

  -- Source of record: rows (JSON blob per row)
  CREATE TABLE IF NOT EXISTS sor_rows (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES sor_tables(id) ON DELETE CASCADE,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Source of record: per-agent permissions
  CREATE TABLE IF NOT EXISTS sor_permissions (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES sor_tables(id) ON DELETE CASCADE,
    can_read INTEGER NOT NULL DEFAULT 1,
    can_write INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, table_id)
  );

  -- Model provider API keys (e.g. DeepInfra, Together, OpenAI)
  CREATE TABLE IF NOT EXISTS model_providers (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Skills installed per agent
  CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'yokebot',
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (agent_id, skill_name)
  );

  -- Activity / audit log
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    agent_id TEXT,
    description TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Notifications
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    emailed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Notification preferences
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL DEFAULT '',
    in_app_enabled INTEGER NOT NULL DEFAULT 1,
    email_enabled INTEGER NOT NULL DEFAULT 1,
    muted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, team_id)
  );

  -- Per-category alert preferences
  CREATE TABLE IF NOT EXISTS alert_preferences (
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    in_app INTEGER NOT NULL DEFAULT 1,
    email INTEGER NOT NULL DEFAULT 0,
    slack INTEGER NOT NULL DEFAULT 0,
    telegram INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, team_id, category)
  );

  -- Goals
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    target_date TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Goal-task links (which tasks contribute to a goal)
  CREATE TABLE IF NOT EXISTS goal_tasks (
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (goal_id, task_id)
  );

  -- Team subscriptions (billing)
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
    included_credits INTEGER NOT NULL DEFAULT 0,
    credits_reset_at TEXT,
    current_period_end TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Team credit balance
  CREATE TABLE IF NOT EXISTS team_credits (
    team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Credit transaction log
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

  -- Model credit costs (star ratings, descriptions, per-use cost)
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

  -- Skill credit costs (per-use cost for external skill tools)
  CREATE TABLE IF NOT EXISTS skill_credit_costs (
    skill_name TEXT PRIMARY KEY,
    credits_per_use INTEGER NOT NULL DEFAULT 0
  );

  -- KPI Goals (measurable milestones)
  CREATE TABLE IF NOT EXISTS kpi_goals (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    current_value REAL NOT NULL DEFAULT 0,
    target_value REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Team credentials (BYOK API keys, encrypted)
  CREATE TABLE IF NOT EXISTS team_credentials (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    service_id TEXT NOT NULL,
    credential_type TEXT NOT NULL DEFAULT 'api_key',
    encrypted_value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (team_id, service_id)
  );

  -- MCP servers configured per agent (self-hosted)
  CREATE TABLE IF NOT EXISTS agent_mcp_servers (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    server_name TEXT NOT NULL,
    transport_type TEXT NOT NULL DEFAULT 'stdio',
    command TEXT,
    args TEXT,
    url TEXT,
    env_vars TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(agent_id, server_name)
  );

  -- Team profiles (onboarding context)
  CREATE TABLE IF NOT EXISTS team_profiles (
    team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    company_name TEXT,
    industry TEXT,
    company_size TEXT,
    primary_goal TEXT,
    onboarded_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_agents_team ON agents(team_id);
  CREATE INDEX IF NOT EXISTS idx_messages_team ON messages(team_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_team ON chat_messages(team_id);
  CREATE INDEX IF NOT EXISTS idx_chat_channels_team ON chat_channels(team_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_team ON approvals(team_id);
  CREATE INDEX IF NOT EXISTS idx_sor_tables_team ON sor_tables(team_id);
  CREATE INDEX IF NOT EXISTS idx_activity_team ON activity_log(team_id);
  CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_log(agent_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(event_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, agent_id);
  CREATE INDEX IF NOT EXISTS idx_sor_rows_table ON sor_rows(table_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_team ON notifications(team_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_credit_tx_team ON credit_transactions(team_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_team_sub_stripe ON team_subscriptions(stripe_customer_id);
  CREATE INDEX IF NOT EXISTS idx_goals_team ON goals(team_id, status);
  CREATE INDEX IF NOT EXISTS idx_goal_tasks_task ON goal_tasks(task_id);
  CREATE INDEX IF NOT EXISTS idx_kpi_goals_team ON kpi_goals(team_id, status);
  CREATE INDEX IF NOT EXISTS idx_team_creds_team ON team_credentials(team_id);
  CREATE INDEX IF NOT EXISTS idx_agent_mcp_agent ON agent_mcp_servers(agent_id);
`

const POSTGRES_DDL = `
  -- Teams (must come first — referenced by team_id FKs)
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Team members
  CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
  );

  -- Agents table
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stopped',
    department TEXT,
    icon_name TEXT,
    icon_color TEXT,
    model_id TEXT,
    model_endpoint TEXT,
    model_name TEXT,
    system_prompt TEXT,
    proactive INTEGER NOT NULL DEFAULT 0,
    heartbeat_seconds INTEGER NOT NULL DEFAULT 3600,
    active_hours_start INTEGER DEFAULT 9,
    active_hours_end INTEGER DEFAULT 17,
    template_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Conversations / message history per agent
  CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Tasks (Mission Control)
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'medium',
    assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    deadline TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Task dependencies
  CREATE TABLE IF NOT EXISTS task_deps (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on)
  );

  -- Chat messages
  CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    channel_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Chat channels
  CREATE TABLE IF NOT EXISTS chat_channels (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'group',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Approval queue
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    action_detail TEXT NOT NULL,
    risk_level TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );

  -- Source of record: dynamic tables registry
  CREATE TABLE IF NOT EXISTS sor_tables (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, name)
  );

  -- Source of record: column definitions
  CREATE TABLE IF NOT EXISTS sor_columns (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES sor_tables(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    col_type TEXT NOT NULL DEFAULT 'text',
    position INTEGER NOT NULL DEFAULT 0
  );

  -- Source of record: rows (JSONB for query capability)
  CREATE TABLE IF NOT EXISTS sor_rows (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES sor_tables(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Source of record: per-agent permissions
  CREATE TABLE IF NOT EXISTS sor_permissions (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES sor_tables(id) ON DELETE CASCADE,
    can_read INTEGER NOT NULL DEFAULT 1,
    can_write INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, table_id)
  );

  -- Model provider API keys
  CREATE TABLE IF NOT EXISTS model_providers (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Skills installed per agent
  CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'yokebot',
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_id, skill_name)
  );

  -- Activity / audit log
  CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    agent_id TEXT,
    description TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Notifications
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    emailed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Notification preferences
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL DEFAULT '',
    in_app_enabled INTEGER NOT NULL DEFAULT 1,
    email_enabled INTEGER NOT NULL DEFAULT 1,
    muted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, team_id)
  );

  -- Per-category alert preferences
  CREATE TABLE IF NOT EXISTS alert_preferences (
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    in_app INTEGER NOT NULL DEFAULT 1,
    email INTEGER NOT NULL DEFAULT 0,
    slack INTEGER NOT NULL DEFAULT 0,
    telegram INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, team_id, category)
  );

  -- Goals
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    target_date TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Goal-task links (which tasks contribute to a goal)
  CREATE TABLE IF NOT EXISTS goal_tasks (
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (goal_id, task_id)
  );

  -- Team subscriptions (billing)
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
    included_credits INTEGER NOT NULL DEFAULT 0,
    credits_reset_at TEXT,
    current_period_end TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Team credit balance
  CREATE TABLE IF NOT EXISTS team_credits (
    team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Credit transaction log
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

  -- Model credit costs (star ratings, descriptions, per-use cost)
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

  -- Skill credit costs (per-use cost for external skill tools)
  CREATE TABLE IF NOT EXISTS skill_credit_costs (
    skill_name TEXT PRIMARY KEY,
    credits_per_use INTEGER NOT NULL DEFAULT 0
  );

  -- KPI Goals (measurable milestones)
  CREATE TABLE IF NOT EXISTS kpi_goals (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    current_value REAL NOT NULL DEFAULT 0,
    target_value REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Team credentials (BYOK API keys, encrypted)
  CREATE TABLE IF NOT EXISTS team_credentials (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    service_id TEXT NOT NULL,
    credential_type TEXT NOT NULL DEFAULT 'api_key',
    encrypted_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, service_id)
  );

  -- MCP servers configured per agent (self-hosted)
  CREATE TABLE IF NOT EXISTS agent_mcp_servers (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    server_name TEXT NOT NULL,
    transport_type TEXT NOT NULL DEFAULT 'stdio',
    command TEXT,
    args TEXT,
    url TEXT,
    env_vars TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, server_name)
  );

  -- Team profiles (onboarding context)
  CREATE TABLE IF NOT EXISTS team_profiles (
    team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    company_name TEXT,
    industry TEXT,
    company_size TEXT,
    primary_goal TEXT,
    onboarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Migrations: Add columns to tables that may pre-date multi-tenancy
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS template_id TEXT;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE approvals ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE sor_tables ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_agents_team ON agents(team_id);
  CREATE INDEX IF NOT EXISTS idx_messages_team ON messages(team_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_team ON chat_messages(team_id);
  CREATE INDEX IF NOT EXISTS idx_chat_channels_team ON chat_channels(team_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_team ON approvals(team_id);
  CREATE INDEX IF NOT EXISTS idx_sor_tables_team ON sor_tables(team_id);
  CREATE INDEX IF NOT EXISTS idx_activity_team ON activity_log(team_id);
  CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_log(agent_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(event_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, agent_id);
  CREATE INDEX IF NOT EXISTS idx_sor_rows_table ON sor_rows(table_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_team ON notifications(team_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_credit_tx_team ON credit_transactions(team_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_team_sub_stripe ON team_subscriptions(stripe_customer_id);
  CREATE INDEX IF NOT EXISTS idx_goals_team ON goals(team_id, status);
  CREATE INDEX IF NOT EXISTS idx_goal_tasks_task ON goal_tasks(task_id);
  CREATE INDEX IF NOT EXISTS idx_kpi_goals_team ON kpi_goals(team_id, status);
  CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_task ON chat_messages(task_id);
  CREATE INDEX IF NOT EXISTS idx_sor_columns_table ON sor_columns(table_id);
  CREATE INDEX IF NOT EXISTS idx_sor_permissions_table ON sor_permissions(table_id);
  CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_deps(depends_on);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
  CREATE INDEX IF NOT EXISTS idx_team_creds_team ON team_credentials(team_id);
  CREATE INDEX IF NOT EXISTS idx_agent_mcp_agent ON agent_mcp_servers(agent_id);

  -- =====================================================================
  -- Row Level Security (RLS)
  --
  -- All tables are accessed via the Express API using a service_role or
  -- direct Postgres connection (which bypasses RLS). We enable RLS and
  -- leave zero policies so the Supabase PostgREST anon/authenticated
  -- endpoints return zero rows and reject all writes. Defense-in-depth:
  -- even if someone has the anon key, they cannot access any data.
  -- =====================================================================

  ALTER TABLE IF EXISTS agents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS tasks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS task_deps ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS chat_messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS chat_channels ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS approvals ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS sor_tables ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS sor_columns ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS sor_rows ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS sor_permissions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS model_providers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS agent_skills ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS teams ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS team_members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS activity_log ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS notification_preferences ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS alert_preferences ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS goals ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS goal_tasks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS team_subscriptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS team_credits ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS credit_transactions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS model_credit_costs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS skill_credit_costs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS kpi_goals ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS team_credentials ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS agent_mcp_servers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS team_profiles ENABLE ROW LEVEL SECURITY;

  -- No permissive policies = deny all for anon + authenticated roles.
  -- The Express backend connects as the Postgres owner or uses
  -- service_role (both bypass RLS), so it is unaffected.
`

export async function migrate(db: Db): Promise<void> {
  const ddl = db.driver === 'postgres' ? POSTGRES_DDL : SQLITE_DDL
  await db.exec(ddl)
}
