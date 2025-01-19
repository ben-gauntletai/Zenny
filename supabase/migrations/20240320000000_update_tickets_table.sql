-- Update enum types if they don't exist
DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'solved', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ticket_type AS ENUM ('question', 'incident', 'problem', 'task');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update the tickets table
ALTER TABLE tickets
    ALTER COLUMN status TYPE ticket_status USING status::ticket_status,
    ALTER COLUMN priority TYPE ticket_priority USING priority::ticket_priority,
    ADD COLUMN IF NOT EXISTS ticket_type ticket_type DEFAULT 'question',
    ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id),
    ADD COLUMN IF NOT EXISTS last_requester_update timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS last_agent_update timestamptz DEFAULT now();

-- Create groups table if it doesn't exist
CREATE TABLE IF NOT EXISTS groups (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add default Support group
INSERT INTO groups (name, description)
SELECT 'Support', 'Default support group'
WHERE NOT EXISTS (
    SELECT 1 FROM groups WHERE name = 'Support'
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_group ON tickets(group_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_last_updates ON tickets(last_requester_update, last_agent_update); 