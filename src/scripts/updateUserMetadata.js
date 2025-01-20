require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function updateUserMetadata(email) {
    console.log(`Updating metadata for user: ${email}`);
    
    try {
        // First, get the user by email
        const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
        
        if (usersError) {
            console.error('Error listing users:', usersError.message);
            return;
        }

        const user = users.find(u => u.email === email);
        if (!user) {
            console.error('User not found');
            return;
        }

        console.log('Found user:', user.id);

        // Update the user's metadata
        const { data, error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            { user_metadata: { role: 'admin' } }
        );

        if (updateError) {
            console.error('Error updating user:', updateError.message);
            return;
        }

        console.log('Successfully updated user metadata:', data);

        // Also update the profile
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', user.id);

        if (profileError) {
            console.error('Error updating profile:', profileError.message);
            return;
        }

        console.log('Successfully updated profile');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
    console.error('Please provide an email address as an argument');
    process.exit(1);
}

updateUserMetadata(email); 