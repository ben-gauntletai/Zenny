-- First, drop existing tables if they exist
DROP TABLE IF EXISTS replies CASCADE;
DROP TABLE IF EXISTS knowledge_base_articles CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

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
    user_id uuid NOT NULL,
    assigned_to uuid,
    group_id uuid REFERENCES groups(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_requester_update timestamptz DEFAULT now(),
    last_agent_update timestamptz DEFAULT now(),
    CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id),
    CONSTRAINT tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id)
);

-- Create replies table (replacing ticket_comments)
CREATE TABLE replies (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    ticket_id bigint REFERENCES tickets(id) ON DELETE CASCADE,
    content text NOT NULL,
    user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    is_public boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create view for replies with user info
CREATE OR REPLACE VIEW replies_with_users AS
SELECT 
    r.*,
    p.email as user_email
FROM replies r
LEFT JOIN profiles p ON r.user_id = p.id;

-- Create knowledge base articles table
CREATE TABLE knowledge_base_articles (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    title text NOT NULL,
    content text NOT NULL,
    author_id uuid REFERENCES profiles(id) NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    tags TEXT[],
    timezone TEXT,
    group_name TEXT,
    user_type TEXT DEFAULT 'end-user',
    access TEXT DEFAULT 'full',
    organization TEXT,
    language TEXT DEFAULT 'en',
    details JSONB,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email);

-- Create a GIN index for the tags array for faster tag-based searches
CREATE INDEX IF NOT EXISTS customers_tags_idx ON customers USING GIN(tags);

-- Add indexes for better performance
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_user_id ON tickets(user_id);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_group_id ON tickets(group_id);
CREATE INDEX idx_tickets_last_updates ON tickets(last_requester_update, last_agent_update);
CREATE INDEX idx_replies_ticket_id ON replies(ticket_id);
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

CREATE TRIGGER update_replies_updated_at
    BEFORE UPDATE ON replies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_articles_updated_at
    BEFORE UPDATE ON knowledge_base_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create view for tickets with user info
CREATE OR REPLACE VIEW tickets_with_users AS
SELECT 
    t.*,
    u.email as user_email,
    a.email as agent_email
FROM tickets t
LEFT JOIN profiles u ON t.user_id = u.id
LEFT JOIN profiles a ON t.assigned_to = a.id;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

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

-- Replies policies (replacing ticket_comments policies)
CREATE POLICY "Users can view replies for tickets they own or are assigned to"
    ON replies FOR SELECT
    TO authenticated
    USING (
        auth.uid() IN (
            SELECT user_id FROM tickets WHERE id = ticket_id
            UNION
            SELECT assigned_to FROM tickets WHERE id = ticket_id
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('agent', 'admin')
        )
    );

CREATE POLICY "Users can create replies for their tickets"
    ON replies FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM tickets WHERE id = ticket_id
            UNION
            SELECT assigned_to FROM tickets WHERE id = ticket_id
        ) OR
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

-- Add some sample data
INSERT INTO customers (name, email, timezone, tags, user_type, organization)
VALUES 
    ('Berlin Torres', 'berlin.torres@example.com', '(GMT-07:00) Arizona', ARRAY[]::TEXT[], 'end-user', 'Example Corp'),
    ('Jiwon Bora', 'jiwon.bora@example.com', '(GMT-07:00) Arizona', ARRAY[]::TEXT[], 'end-user', 'Example Corp'),
    ('Hikari Ito', 'hikari.ito@example.com', '(GMT-07:00) Arizona', ARRAY[]::TEXT[], 'end-user', 'Example Corp'),
    ('August Lee', 'august.lee@example.com', '(GMT-07:00) Arizona', ARRAY[]::TEXT[], 'end-user', 'Example Corp'),
    ('The Customer', 'customer@example.com', '(GMT-07:00) Arizona', ARRAY[]::TEXT[], 'end-user', 'Example Corp');

-- Add function to handle new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        CASE 
            WHEN NEW.raw_user_meta_data->>'role' = 'customer' THEN 'user'::user_role
            ELSE (COALESCE(NEW.raw_user_meta_data->>'role', 'user'))::user_role
        END
    );
    RETURN NEW;
END;
$$ language plpgsql security definer;

-- Add trigger for new user handling
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 