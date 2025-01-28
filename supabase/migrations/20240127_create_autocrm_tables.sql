-- Create enum for message sender types
CREATE TYPE message_sender_type AS ENUM ('user', 'system');

-- Create table for storing conversation history
CREATE TABLE autocrm_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create table for storing individual messages
CREATE TABLE autocrm_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES autocrm_conversations(id) ON DELETE CASCADE,
    sender message_sender_type NOT NULL,
    content TEXT NOT NULL,
    display_content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
); 