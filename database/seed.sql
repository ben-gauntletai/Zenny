-- Insert sample profiles and tickets
DO $$
DECLARE
  support_group_id uuid;
  user_id_1 uuid := 'b1d6dddd-b69b-49e2-a3eb-8fca0afb4119'; -- Your current user ID
  user_id_2 uuid := '123e4567-e89b-12d3-a456-426614174000'; -- Sample agent ID
BEGIN
  -- Insert profiles first
  INSERT INTO profiles (id, email, full_name, role)
  VALUES
    (user_id_1, 'ttttsmurf1@gmail.com', 'Regular User', 'user'),
    (user_id_2, 'agent@example.com', 'Support Agent', 'agent')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role;

  -- Get the Support group ID
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
    'I am unable to log in to my account. It says invalid credentials.',
    'open',
    'high',
    'problem',
    'ISSUE',
    'VIP_CUSTOMER',
    user_id_1,
    user_id_2,
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
    user_id_1,
    null,
    support_group_id
  ),
  (
    'Feature request: Dark mode',
    'Would love to see a dark mode option.',
    'pending',
    'low',
    'task',
    'OTHER',
    'VIP_CUSTOMER',
    user_id_1,
    user_id_2,
    support_group_id
  ),
  (
    'Service is down',
    'Getting 500 error when trying to access the dashboard.',
    'open',
    'urgent',
    'incident',
    'ISSUE',
    'VIP_CUSTOMER',
    user_id_1,
    user_id_2,
    support_group_id
  ),
  (
    'Need help with API integration',
    'Looking for documentation on API endpoints.',
    'open',
    'normal',
    'question',
    'INQUIRY',
    'STANDARD_CUSTOMER',
    user_id_1,
    null,
    support_group_id
  );
END $$; 