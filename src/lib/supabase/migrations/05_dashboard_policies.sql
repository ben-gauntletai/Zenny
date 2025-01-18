-- Enable RLS on tables
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own tickets
CREATE POLICY "Users can view their own tickets"
ON tickets FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  auth.uid() = agent_id OR
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'agent'
  )
);

-- Policy for everyone to view knowledge base articles
CREATE POLICY "Anyone can view knowledge base articles"
ON knowledge_base FOR SELECT
TO authenticated
USING (true); 