-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own tickets and agents can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Users can view their own tickets and agents can view all ticket" ON tickets;

-- Create new policy using auth.users
CREATE POLICY "Users can view their own tickets and agents can view all tickets"
    ON tickets FOR SELECT
    USING (
        auth.uid() = user_id 
        OR EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND raw_user_meta_data->>'role' = 'agent'
        )
    ); 