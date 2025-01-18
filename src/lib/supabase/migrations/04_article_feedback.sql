-- Create article feedback table
CREATE TABLE article_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    article_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_helpful BOOLEAN NOT NULL,
    feedback_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create article analytics table
CREATE TABLE article_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    article_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    views INTEGER DEFAULT 0,
    unique_views INTEGER DEFAULT 0,
    avg_time_spent FLOAT DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Create view tracking table
CREATE TABLE article_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    article_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    time_spent INTEGER, -- in seconds
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger for feedback
CREATE TRIGGER set_feedback_updated_at
    BEFORE UPDATE ON article_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX article_feedback_article_id_idx ON article_feedback(article_id);
CREATE INDEX article_feedback_user_id_idx ON article_feedback(user_id);
CREATE INDEX article_analytics_article_id_idx ON article_analytics(article_id);
CREATE INDEX article_views_article_id_idx ON article_views(article_id);
CREATE INDEX article_views_user_id_idx ON article_views(user_id);
CREATE INDEX article_views_session_id_idx ON article_views(session_id);

-- Enable RLS
ALTER TABLE article_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_views ENABLE ROW LEVEL SECURITY;

-- Create policies for feedback
CREATE POLICY "Feedback is viewable by agents"
    ON article_feedback FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'role' = 'agent'
        )
    );

CREATE POLICY "Users can create feedback"
    ON article_feedback FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feedback"
    ON article_feedback FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create policies for analytics
CREATE POLICY "Analytics are viewable by agents"
    ON article_analytics FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'role' = 'agent'
        )
    );

-- Create policies for views
CREATE POLICY "Views are insertable by everyone"
    ON article_views FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Views are viewable by agents"
    ON article_views FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'role' = 'agent'
        )
    );

-- Create function to update analytics
CREATE OR REPLACE FUNCTION update_article_analytics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or insert analytics record
    INSERT INTO article_analytics (
        article_id,
        views,
        unique_views,
        helpful_count,
        not_helpful_count,
        avg_time_spent,
        last_updated
    )
    SELECT
        NEW.article_id,
        (SELECT COUNT(*) FROM article_views WHERE article_id = NEW.article_id),
        (SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) FROM article_views WHERE article_id = NEW.article_id),
        (SELECT COUNT(*) FROM article_feedback WHERE article_id = NEW.article_id AND is_helpful = true),
        (SELECT COUNT(*) FROM article_feedback WHERE article_id = NEW.article_id AND is_helpful = false),
        (SELECT AVG(time_spent) FROM article_views WHERE article_id = NEW.article_id AND time_spent IS NOT NULL),
        NOW()
    ON CONFLICT (article_id) DO UPDATE
    SET
        views = EXCLUDED.views,
        unique_views = EXCLUDED.unique_views,
        helpful_count = EXCLUDED.helpful_count,
        not_helpful_count = EXCLUDED.not_helpful_count,
        avg_time_spent = EXCLUDED.avg_time_spent,
        last_updated = EXCLUDED.last_updated;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update analytics
CREATE TRIGGER update_analytics_on_view
    AFTER INSERT OR UPDATE ON article_views
    FOR EACH ROW
    EXECUTE FUNCTION update_article_analytics();

CREATE TRIGGER update_analytics_on_feedback
    AFTER INSERT OR UPDATE ON article_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_article_analytics(); 