-- Drop existing table and type if they exist
DROP TABLE IF EXISTS notifications;
DROP TYPE IF EXISTS notification_type;

-- Create notification type enum
CREATE TYPE notification_type AS ENUM (
    'TICKET_CREATED',
    'TICKET_UPDATED',
    'TICKET_ASSIGNED',
    'COMMENT_ADDED'
);

-- Create notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    read_at TIMESTAMPTZ
);

-- Create indexes for better performance
CREATE INDEX idx_notifications_ticket ON notifications(ticket_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Add RLS policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Allow read access to notifications for ticket participants and agents/admins
CREATE POLICY "Users can view notifications for their tickets"
    ON notifications FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = notifications.ticket_id
            AND (
                tickets.user_id = auth.uid() OR
                tickets.assigned_to = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('agent', 'admin')
                )
            )
        )
    );

-- Allow insert access to the edge function (using service role)
CREATE POLICY "Service role can insert notifications"
    ON notifications FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Add trigger to update tickets.updated_at when notifications are added
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tickets
    SET updated_at = now()
    WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ticket_on_notification
    AFTER INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_timestamp(); 