-- Insert sample profiles
INSERT INTO profiles (id, email, full_name, role)
VALUES 
    ('d7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b', 'john.agent@example.com', 'John Agent', 'agent'),
    ('e9be4f7d-4b1e-4043-89e5-1c59895cb5c1', 'sarah.admin@example.com', 'Sarah Admin', 'admin'),
    ('f8cf7d2e-3c2f-4f1a-b5d9-2d9a9e6f8b1a', 'alice.user@example.com', 'Alice User', 'user'),
    ('a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d', 'bob.user@example.com', 'Bob User', 'user');

-- Get the Support group ID
DO $$
DECLARE
    support_group_id uuid;
BEGIN
    SELECT id INTO support_group_id FROM groups WHERE name = 'Support';

    -- Insert sample tickets
    INSERT INTO tickets (
        subject,
        description,
        status,
        priority,
        ticket_type,
        topic,
        customer_type,
        user_id,
        assigned_to,
        group_id
    ) VALUES 
    (
        'Cannot access my account',
        'I have been trying to log in to my account for the past hour but keep getting an error message.',
        'open',
        'high',
        'incident',
        'ISSUE',
        'STANDARD_CUSTOMER',
        'f8cf7d2e-3c2f-4f1a-b5d9-2d9a9e6f8b1a', -- Alice
        'd7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b', -- John
        support_group_id
    ),
    (
        'How do I change my subscription plan?',
        'I would like to upgrade my current subscription to the premium plan. Please guide me through the process.',
        'open',
        'normal',
        'question',
        'INQUIRY',
        'VIP_CUSTOMER',
        'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d', -- Bob
        'd7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b', -- John
        support_group_id
    ),
    (
        'Payment failed for recent transaction',
        'I attempted to make a payment but it was declined. My card has sufficient funds.',
        'pending',
        'urgent',
        'problem',
        'PAYMENTS',
        'VIP_CUSTOMER',
        'f8cf7d2e-3c2f-4f1a-b5d9-2d9a9e6f8b1a', -- Alice
        'e9be4f7d-4b1e-4043-89e5-1c59895cb5c1', -- Sarah
        support_group_id
    ),
    (
        'Feature request: Dark mode',
        'Would love to see a dark mode option in the application.',
        'open',
        'low',
        'task',
        'OTHER',
        'STANDARD_CUSTOMER',
        'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d', -- Bob
        NULL,
        support_group_id
    ),
    (
        'Mobile app crashes on startup',
        'The mobile app crashes immediately when I try to open it. I have tried reinstalling but the issue persists.',
        'open',
        'high',
        'incident',
        'ISSUE',
        'STANDARD_CUSTOMER',
        'f8cf7d2e-3c2f-4f1a-b5d9-2d9a9e6f8b1a', -- Alice
        'd7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b', -- John
        support_group_id
    );
END $$;

-- Insert sample ticket comments
INSERT INTO ticket_comments (ticket_id, user_id, content)
SELECT 
  t.id,
  t.assigned_to,
  'I am looking into this issue and will update you shortly.'
FROM tickets t
WHERE t.subject = 'Cannot access my account'
UNION ALL
SELECT 
  t.id,
  t.user_id,
  'Thank you for the quick response. Looking forward to the resolution.'
FROM tickets t
WHERE t.subject = 'Cannot access my account';

-- Insert sample knowledge base articles
INSERT INTO knowledge_base_articles (title, content, author_id)
VALUES 
    (
        'Getting Started Guide',
        'Welcome to our application! This guide will help you get started with the basic features...',
        'd7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b'::uuid  -- John (agent)
    ),
    (
        'API Documentation',
        'Complete guide to our REST API endpoints and authentication...',
        'e9be4f7d-4b1e-4043-89e5-1c59895cb5c1'::uuid  -- Sarah (admin)
    ),
    (
        'Troubleshooting Common Issues',
        'Solutions to frequently encountered problems and error messages...',
        'd7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b'::uuid  -- John (agent)
    ); 