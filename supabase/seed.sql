-- Seed users first
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
    ('d7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b', 'john.agent@example.com', '{"role":"agent"}'::jsonb),
    ('e9be4f7d-4b1e-4043-89e5-1c59895cb5c1', 'sarah.admin@example.com', '{"role":"admin"}'::jsonb),
    ('f8cf7d2e-3c2f-4f1a-b5d9-2d9a9e6f8b1a', 'alice.user@example.com', '{"role":"customer"}'::jsonb),
    ('a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d', 'bob.user@example.com', '{"role":"customer"}'::jsonb),
    ('b1d6dddd-b69b-49e2-a3eb-8fca0afb4119', 'ttttsmurf1@gmail.com', '{"role":"user"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Insert sample profiles
INSERT INTO profiles (id, email, full_name, role)
VALUES 
    ('d7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b', 'john.agent@example.com', 'John Agent', 'agent'),
    ('e9be4f7d-4b1e-4043-89e5-1c59895cb5c1', 'sarah.admin@example.com', 'Sarah Admin', 'admin'),
    ('f8cf7d2e-3c2f-4f1a-b5d9-2d9a9e6f8b1a', 'alice.user@example.com', 'Alice User', 'user'),
    ('a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d', 'bob.user@example.com', 'Bob User', 'user'),
    ('b1d6dddd-b69b-49e2-a3eb-8fca0afb4119', 'ttttsmurf1@gmail.com', 'Test User', 'user')
ON CONFLICT (id) DO NOTHING;

-- Insert sample customers with more detailed information
INSERT INTO customers (
    name,
    email,
    tags,
    timezone,
    group_name,
    user_type,
    access,
    organization,
    language,
    details,
    notes
) VALUES 
    (
        'John Smith',
        'john.smith@example.com',
        ARRAY['VIP', 'Enterprise'],
        'America/New_York',
        'Enterprise',
        'end-user',
        'full',
        'Acme Corp',
        'en',
        '{"subscription": "enterprise", "employees": 500}'::jsonb,
        'Key account, requires priority support'
    ),
    (
        'Sarah Johnson',
        'sarah.j@techstart.io',
        ARRAY['Startup', 'Beta'],
        'Europe/London',
        'Startup',
        'end-user',
        'full',
        'TechStart',
        'en',
        '{"subscription": "startup", "employees": 20}'::jsonb,
        'Beta testing new features'
    ),
    (
        'Maria Garcia',
        'mgarcia@bigcorp.com',
        ARRAY['Enterprise', 'Support Priority'],
        'America/Chicago',
        'Enterprise',
        'end-user',
        'full',
        'BigCorp Inc',
        'es',
        '{"subscription": "enterprise", "employees": 1000}'::jsonb,
        'Spanish language support preferred'
    ),
    (
        'David Lee',
        'david.lee@smallbiz.net',
        ARRAY['SMB', 'New'],
        'Asia/Tokyo',
        'Small Business',
        'end-user',
        'full',
        'SmallBiz Solutions',
        'en',
        '{"subscription": "basic", "employees": 10}'::jsonb,
        'New customer onboarding in progress'
    ),
    (
        'Emma Wilson',
        'emma@growthco.io',
        ARRAY['Startup', 'Growth'],
        'Europe/Berlin',
        'Startup',
        'end-user',
        'full',
        'GrowthCo',
        'en',
        '{"subscription": "growth", "employees": 50}'::jsonb,
        'Rapidly expanding team'
    ),
    (
        'Carlos Rodriguez',
        'carlos@megacorp.com',
        ARRAY['Enterprise', 'Technical'],
        'America/Los_Angeles',
        'Enterprise',
        'end-user',
        'full',
        'MegaCorp',
        'es',
        '{"subscription": "enterprise", "employees": 2000}'::jsonb,
        'Technical account requiring API support'
    ),
    (
        'Lisa Chen',
        'lisa.chen@innovate.co',
        ARRAY['Startup', 'Developer'],
        'Asia/Singapore',
        'Startup',
        'end-user',
        'full',
        'Innovate Co',
        'en',
        '{"subscription": "startup", "employees": 15}'::jsonb,
        'Developer-focused account'
    ),
    (
        'Alex Kumar',
        'alex@quickstart.dev',
        ARRAY['SMB', 'Developer'],
        'Asia/Kolkata',
        'Small Business',
        'end-user',
        'full',
        'QuickStart Dev',
        'en',
        '{"subscription": "pro", "employees": 25}'::jsonb,
        'Developer tools integration customer'
    ),
    (
        'Sophie Martin',
        'sophie@artdesign.co',
        ARRAY['SMB', 'Creative'],
        'Europe/Paris',
        'Small Business',
        'end-user',
        'full',
        'Art & Design Co',
        'fr',
        '{"subscription": "basic", "employees": 5}'::jsonb,
        'Design agency account'
    ),
    (
        'James Wilson',
        'james@techhub.io',
        ARRAY['Startup', 'Technical'],
        'Europe/London',
        'Startup',
        'end-user',
        'full',
        'TechHub',
        'en',
        '{"subscription": "startup", "employees": 30}'::jsonb,
        'Technical integration ongoing'
    )
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    tags = EXCLUDED.tags,
    timezone = EXCLUDED.timezone,
    group_name = EXCLUDED.group_name,
    details = EXCLUDED.details,
    notes = EXCLUDED.notes,
    updated_at = now();

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
    ),
    (
        'Need help with login issues',
        'I cannot log in to my account after the recent update.',
        'open',
        'high',
        'incident',
        'ISSUE',
        'STANDARD_CUSTOMER',
        'b1d6dddd-b69b-49e2-a3eb-8fca0afb4119', -- Your user
        'd7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b', -- John
        support_group_id
    ),
    (
        'Feature suggestion for dashboard',
        'Would it be possible to add custom widgets to the dashboard?',
        'pending',
        'normal',
        'task',
        'OTHER',
        'STANDARD_CUSTOMER',
        'b1d6dddd-b69b-49e2-a3eb-8fca0afb4119', -- Your user
        'e9be4f7d-4b1e-4043-89e5-1c59895cb5c1', -- Sarah
        support_group_id
    ),
    (
        'Billing question',
        'I have a question about my recent invoice.',
        'open',
        'normal',
        'question',
        'PAYMENTS',
        'STANDARD_CUSTOMER',
        'b1d6dddd-b69b-49e2-a3eb-8fca0afb4119', -- Your user
        NULL, -- Unassigned
        support_group_id
    );
END $$;

-- Insert sample replies
INSERT INTO replies (ticket_id, content, user_id, is_public)
SELECT 
    t.id,
    'Hi! I''d be happy to help you troubleshoot. Could you please tell me what specific issues you''re encountering?',
    'd7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b'::uuid, -- John (agent)
    true
FROM tickets t 
WHERE t.subject = 'Cannot access my account'
UNION ALL
SELECT 
    t.id,
    'When I try to log in, it says "Invalid credentials" even though I''m sure my password is correct.',
    'f8cf7d2e-3c2f-4f1a-b5d9-2d9a9e6f8b1a'::uuid, -- Alice (user)
    true
FROM tickets t
WHERE t.subject = 'Cannot access my account'
UNION ALL
SELECT 
    t.id,
    'Thanks for the details. Let me check if there are any issues with your account. Have you tried resetting your password?',
    'd7bed82c-89ac-4d1e-9366-fe3c0b3b5e0b'::uuid, -- John (agent)
    true
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