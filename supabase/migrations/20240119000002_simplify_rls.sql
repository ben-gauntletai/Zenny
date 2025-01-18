-- Drop all existing policies
DROP POLICY IF EXISTS "tickets_select_policy" ON tickets;
DROP POLICY IF EXISTS "tickets_insert_policy" ON tickets;
DROP POLICY IF EXISTS "tickets_update_policy" ON tickets;

-- Disable and re-enable RLS
ALTER TABLE tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Create a simple policy for viewing tickets
CREATE POLICY "view_tickets"
    ON tickets FOR SELECT
    USING (true);  -- Allow all authenticated users to view tickets

-- Create a simple policy for creating tickets
CREATE POLICY "create_tickets"
    ON tickets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create a simple policy for updating tickets
CREATE POLICY "update_tickets"
    ON tickets FOR UPDATE
    USING (true);  -- Allow all authenticated users to update tickets for now 