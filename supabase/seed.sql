-- Insert sample tickets
INSERT INTO tickets (title, description, status, priority, user_id, assigned_to)
VALUES 
    ('Login page not working', 'Unable to log in to the application. Getting a 500 error.', 'open', 'high', auth.uid(), NULL),
    ('Need help with API integration', 'Looking for documentation on how to integrate the payment API.', 'in_progress', 'medium', auth.uid(), NULL),
    ('Feature request: Dark mode', 'Would love to see a dark mode option in the settings.', 'open', 'low', auth.uid(), NULL);

-- Insert sample knowledge base articles
INSERT INTO knowledge_base_articles (title, content, category, tags, author_id)
VALUES 
    (
        'Getting Started Guide',
        'Welcome to our application! This guide will help you get started with the basic features...',
        'General',
        ARRAY['getting-started', 'guide', 'basics'],
        auth.uid()
    ),
    (
        'API Documentation',
        'Complete guide to our REST API endpoints and authentication...',
        'Development',
        ARRAY['api', 'development', 'integration'],
        auth.uid()
    ),
    (
        'Troubleshooting Common Issues',
        'Solutions to frequently encountered problems and error messages...',
        'Support',
        ARRAY['troubleshooting', 'errors', 'help'],
        auth.uid()
    );

-- Insert sample ticket comments
INSERT INTO ticket_comments (ticket_id, user_id, content)
SELECT 
    id,
    auth.uid(),
    'Thank you for reporting this issue. Our team is looking into it.'
FROM tickets
WHERE title = 'Login page not working';

-- Insert sample article views
INSERT INTO article_views (article_id, user_id, time_spent)
SELECT 
    id,
    auth.uid(),
    300
FROM knowledge_base_articles
WHERE title = 'Getting Started Guide';

-- Insert sample article feedback
INSERT INTO article_feedback (article_id, user_id, is_helpful, comment)
SELECT 
    id,
    auth.uid(),
    true,
    'Very helpful guide, thanks!'
FROM knowledge_base_articles
WHERE title = 'Getting Started Guide'; 