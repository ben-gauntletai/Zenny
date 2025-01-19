-- First, drop existing tables if they exist
DROP TABLE IF EXISTS ticket_comments CASCADE;
DROP TABLE IF EXISTS knowledge_base_articles CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop existing types
DROP TYPE IF EXISTS ticket_status CASCADE;
DROP TYPE IF EXISTS ticket_priority CASCADE;
DROP TYPE IF EXISTS ticket_type CASCADE;
DROP TYPE IF EXISTS ticket_topic CASCADE;
DROP TYPE IF EXISTS customer_type CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'solved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE ticket_type AS ENUM ('question', 'incident', 'problem', 'task');
CREATE TYPE ticket_topic AS ENUM ('ISSUE', 'INQUIRY', 'OTHER', 'PAYMENTS', 'NONE');
CREATE TYPE customer_type AS ENUM ('VIP_CUSTOMER', 'STANDARD_CUSTOMER');
CREATE TYPE user_role AS ENUM ('user', 'agent', 'admin');

-- Create profiles table first (since tickets will reference it)
CREATE TABLE profiles (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email text UNIQUE NOT NULL,
    full_name text,
    role user_role DEFAULT 'user',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create groups table (since tickets will reference it)
CREATE TABLE groups (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Insert default Support group
INSERT INTO groups (name, description)
VALUES ('Support', 'Default support group');

-- Create tickets table
CREATE TABLE tickets (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    subject text NOT NULL,
    description text NOT NULL,
    status ticket_status DEFAULT 'open',
    priority ticket_priority DEFAULT 'normal',
    ticket_type ticket_type DEFAULT 'question',
    topic ticket_topic DEFAULT 'NONE',
    customer_type customer_type DEFAULT 'STANDARD_CUSTOMER',
    user_id uuid REFERENCES profiles(id) NOT NULL,
    assigned_to uuid REFERENCES profiles(id),
    group_id uuid REFERENCES groups(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_requester_update timestamptz DEFAULT now(),
    last_agent_update timestamptz DEFAULT now()
);

-- Create ticket comments table
CREATE TABLE ticket_comments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id bigint REFERENCES tickets(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) NOT NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create knowledge base articles table
CREATE TABLE knowledge_base_articles (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    title text NOT NULL,
    content text NOT NULL,
    author_id uuid REFERENCES profiles(id) NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_user_id ON tickets(user_id);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_group_id ON tickets(group_id);
CREATE INDEX idx_tickets_last_updates ON tickets(last_requester_update, last_agent_update);
CREATE INDEX idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX idx_knowledge_base_articles_author ON knowledge_base_articles(author_id);

-- Add triggers to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_comments_updated_at
    BEFORE UPDATE ON ticket_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_articles_updated_at
    BEFORE UPDATE ON knowledge_base_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_articles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id OR 
        auth.uid() = assigned_to OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('agent', 'admin')
        )
    );

CREATE POLICY "Users can create tickets"
    ON tickets FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Agents and admins can update tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('agent', 'admin')
        )
    );

-- Comments policies
CREATE POLICY "Users can view ticket comments"
    ON ticket_comments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create comments on their tickets"
    ON ticket_comments FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('agent', 'admin')
        )
    );

-- Knowledge base policies
CREATE POLICY "Anyone can view knowledge base articles"
    ON knowledge_base_articles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only agents and admins can create knowledge base articles"
    ON knowledge_base_articles FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('agent', 'admin')
        )
    ); 