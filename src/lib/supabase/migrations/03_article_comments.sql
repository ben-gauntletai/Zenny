-- Create article comments table
CREATE TABLE article_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    article_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    parent_id UUID REFERENCES article_comments(id) ON DELETE CASCADE -- For nested replies
);

-- Create updated_at trigger
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON article_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX article_comments_article_id_idx ON article_comments(article_id);
CREATE INDEX article_comments_user_id_idx ON article_comments(user_id);
CREATE INDEX article_comments_parent_id_idx ON article_comments(parent_id);

-- Enable RLS
ALTER TABLE article_comments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Comments are viewable by everyone"
    ON article_comments FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create comments"
    ON article_comments FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments"
    ON article_comments FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
    ON article_comments FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create policy for agents to manage all comments
CREATE POLICY "Agents can manage all comments"
    ON article_comments
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'role' = 'agent'
        )
    ); 