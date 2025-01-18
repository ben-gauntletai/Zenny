-- Enable the UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE user_role AS ENUM ('user', 'agent', 'admin');

-- Add role column to auth.users
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user';

-- Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status ticket_status DEFAULT 'open',
    priority ticket_priority DEFAULT 'low',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ticket comments table
CREATE TABLE IF NOT EXISTS ticket_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create knowledge base articles table
CREATE TABLE IF NOT EXISTS knowledge_base_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_articles_updated_at
    BEFORE UPDATE ON knowledge_base_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create RLS policies

-- Tickets policies
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tickets"
    ON tickets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Agents can view all tickets"
    ON tickets FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role IN ('agent', 'admin')
        )
    );

CREATE POLICY "Users can create tickets"
    ON tickets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Agents can update any ticket"
    ON tickets FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role IN ('agent', 'admin')
        )
    );

-- Ticket comments policies
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on their tickets"
    ON ticket_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = ticket_comments.ticket_id
            AND tickets.user_id = auth.uid()
        )
    );

CREATE POLICY "Agents can view all comments"
    ON ticket_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role IN ('agent', 'admin')
        )
    );

CREATE POLICY "Users can create comments on their tickets"
    ON ticket_comments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = ticket_id
            AND tickets.user_id = auth.uid()
        )
    );

CREATE POLICY "Agents can create comments on any ticket"
    ON ticket_comments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role IN ('agent', 'admin')
        )
    );

-- Knowledge base policies
ALTER TABLE knowledge_base_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view knowledge base articles"
    ON knowledge_base_articles FOR SELECT
    USING (true);

CREATE POLICY "Only agents can create knowledge base articles"
    ON knowledge_base_articles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role IN ('agent', 'admin')
        )
    );

CREATE POLICY "Only agents can update knowledge base articles"
    ON knowledge_base_articles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role IN ('agent', 'admin')
        )
    ); 