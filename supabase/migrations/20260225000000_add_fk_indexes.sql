-- Add missing indexes on foreign keys for query performance
CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_task ON chat_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_sor_columns_table ON sor_columns(table_id);
CREATE INDEX IF NOT EXISTS idx_sor_permissions_table ON sor_permissions(table_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_deps(depends_on);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
