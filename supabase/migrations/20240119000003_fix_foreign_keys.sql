-- Drop existing foreign key constraints
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_user_id_fkey;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;

-- Add foreign key constraints with explicit references to auth.users
ALTER TABLE tickets 
    ADD CONSTRAINT tickets_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id);

ALTER TABLE tickets 
    ADD CONSTRAINT tickets_assigned_to_fkey 
    FOREIGN KEY (assigned_to) 
    REFERENCES auth.users(id); 