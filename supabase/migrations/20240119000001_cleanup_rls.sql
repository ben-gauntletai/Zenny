-- First, drop all existing policies
DROP POLICY IF EXISTS "Users can view their own tickets and agents can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Users can view their own tickets and agents can view all ticket" ON tickets;
DROP POLICY IF EXISTS "Users can create tickets" ON tickets;
DROP POLICY IF EXISTS "Users can update their own tickets and agents can update any ticket" ON tickets;

-- Disable and re-enable RLS to ensure clean state
ALTER TABLE tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Create simplified policies for tickets
CREATE POLICY "tickets_select_policy"
    ON tickets FOR SELECT
    USING (
        auth.uid() = user_id 
        OR auth.uid() = assigned_to
        OR (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'agent'
    );

CREATE POLICY "tickets_insert_policy"
    ON tickets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tickets_update_policy"
    ON tickets FOR UPDATE
    USING (
        auth.uid() = user_id 
        OR auth.uid() = assigned_to
        OR (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'agent'
    ); 