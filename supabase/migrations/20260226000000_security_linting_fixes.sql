-- Enable RLS on schema_version (was flagged by Supabase linter)
ALTER TABLE IF EXISTS schema_version ENABLE ROW LEVEL SECURITY;

-- Move vector extension from public to extensions schema
ALTER EXTENSION vector SET SCHEMA extensions;

-- Add missing index on team_meetings.channel_id (foreign key)
CREATE INDEX IF NOT EXISTS idx_team_meetings_channel_id ON team_meetings (channel_id);

-- Drop duplicate index on activity_log.team_id (idx_activity_team duplicated idx_activity_log_team)
DROP INDEX IF EXISTS idx_activity_team;
