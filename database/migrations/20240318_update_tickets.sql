-- Drop existing enum types
DROP TYPE IF EXISTS ticket_status CASCADE;
DROP TYPE IF EXISTS ticket_priority CASCADE;

-- Create updated enum types
CREATE TYPE ticket_status AS ENUM ('NEW', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED');
CREATE TYPE ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE ticket_type AS ENUM ('INCIDENT', 'QUESTION', 'PROBLEM', 'TASK');
CREATE TYPE ticket_topic AS ENUM ('ISSUE', 'INQUIRY', 'OTHER', 'PAYMENTS', 'NONE');
CREATE TYPE customer_type AS ENUM ('VIP_CUSTOMER', 'STANDARD_CUSTOMER');

-- Update tickets table
ALTER TABLE public.tickets
    -- Add new columns
    ADD COLUMN IF NOT EXISTS ticket_type ticket_type DEFAULT 'INCIDENT'::ticket_type NOT NULL,
    ADD COLUMN IF NOT EXISTS topic ticket_topic DEFAULT 'NONE'::ticket_topic NOT NULL,
    ADD COLUMN IF NOT EXISTS customer_type customer_type DEFAULT 'STANDARD_CUSTOMER'::customer_type NOT NULL,
    
    -- Update existing priority column to use new enum
    ALTER COLUMN priority TYPE ticket_priority USING 
        CASE priority::text
            WHEN 'low' THEN 'LOW'::ticket_priority
            WHEN 'medium' THEN 'NORMAL'::ticket_priority
            WHEN 'high' THEN 'HIGH'::ticket_priority
            ELSE 'NORMAL'::ticket_priority
        END,
    ALTER COLUMN priority SET DEFAULT 'NORMAL'::ticket_priority,
    
    -- Update existing status column to use new enum
    ALTER COLUMN status TYPE ticket_status USING 
        CASE status::text
            WHEN 'open' THEN 'NEW'::ticket_status
            WHEN 'pending' THEN 'PENDING'::ticket_status
            WHEN 'solved' THEN 'RESOLVED'::ticket_status
            ELSE 'NEW'::ticket_status
        END,
    ALTER COLUMN status SET DEFAULT 'NEW'::ticket_status;

-- Update indexes
DROP INDEX IF EXISTS tickets_status_idx;
CREATE INDEX tickets_status_idx ON public.tickets(status);

DROP INDEX IF EXISTS tickets_priority_idx;
CREATE INDEX tickets_priority_idx ON public.tickets(priority);

DROP INDEX IF EXISTS tickets_type_idx;
CREATE INDEX tickets_type_idx ON public.tickets(ticket_type);

DROP INDEX IF EXISTS tickets_customer_type_idx;
CREATE INDEX tickets_customer_type_idx ON public.tickets(customer_type);

-- Add comment to describe the table
COMMENT ON TABLE public.tickets IS 'Stores support tickets with their metadata and relationships';

-- Add comments for the columns
COMMENT ON COLUMN public.tickets.ticket_type IS 'Type of ticket: INCIDENT, QUESTION, PROBLEM, or TASK';
COMMENT ON COLUMN public.tickets.priority IS 'Ticket priority: LOW, NORMAL, HIGH, or URGENT';
COMMENT ON COLUMN public.tickets.topic IS 'Topic category: ISSUE, INQUIRY, OTHER, PAYMENTS, or NONE';
COMMENT ON COLUMN public.tickets.customer_type IS 'Type of customer: VIP_CUSTOMER or STANDARD_CUSTOMER'; 