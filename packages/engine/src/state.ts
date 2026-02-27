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
`

export async function migrate(db: Db): Promise<void> {
  const ddl = db.driver === 'postgres' ? POSTGRES_DDL : SQLITE_DDL
  await db.exec(ddl)
}
