-- Drop existing notifications table if it exists
DROP TABLE IF EXISTS notifications CASCADE;

-- Create notifications table matching production schema
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    title TEXT,
    message TEXT,
    type TEXT,
    ticket_id INT8,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
); 