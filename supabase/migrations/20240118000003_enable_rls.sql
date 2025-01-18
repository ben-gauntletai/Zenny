-- Enable Row Level Security
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_feedback ENABLE ROW LEVEL SECURITY;

-- Create policies for tickets
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

CREATE POLICY "Users can create tickets"
    ON tickets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tickets and agents can update any ticket"
    ON tickets FOR UPDATE
    USING (
        auth.uid() = user_id 
        OR EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND raw_user_meta_data->>'role' = 'agent'
        )
    );

-- Create policies for ticket comments
CREATE POLICY "Anyone can view comments on accessible tickets"
    ON ticket_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tickets 
            WHERE tickets.id = ticket_comments.ticket_id 
            AND (
                tickets.user_id = auth.uid() 
                OR EXISTS (
                    SELECT 1 FROM auth.users 
                    WHERE id = auth.uid() 
                    AND raw_user_meta_data->>'role' = 'agent'
                )
            )
        )
    );

CREATE POLICY "Users can create comments on accessible tickets"
    ON ticket_comments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tickets 
            WHERE tickets.id = ticket_id 
            AND (
                tickets.user_id = auth.uid() 
                OR EXISTS (
                    SELECT 1 FROM auth.users 
                    WHERE id = auth.uid() 
                    AND raw_user_meta_data->>'role' = 'agent'
                )
            )
        )
    );

-- Create policies for knowledge base articles
CREATE POLICY "Anyone can view published articles"
    ON knowledge_base_articles FOR SELECT
    USING (true);

CREATE POLICY "Only agents can create articles"
    ON knowledge_base_articles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND raw_user_meta_data->>'role' = 'agent'
        )
    );

CREATE POLICY "Only agents can update articles"
    ON knowledge_base_articles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND raw_user_meta_data->>'role' = 'agent'
        )
    );

-- Create policies for article views and feedback
CREATE POLICY "Users can record their own views"
    ON article_views FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can submit their own feedback"
    ON article_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id); 