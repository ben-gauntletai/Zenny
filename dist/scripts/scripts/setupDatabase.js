import { supabase } from '../src/lib/supabaseClient';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function runSQLFile(filePath) {
    try {
        const sql = fs.readFileSync(path.resolve(__dirname, '../', filePath), 'utf8');
        const { error } = await supabase.rpc('exec_sql', { sql });
        if (error)
            throw error;
        console.log(`Successfully executed ${filePath}`);
    }
    catch (error) {
        console.error(`Error executing ${filePath}:`, error);
        throw error;
    }
}
async function setupDatabase() {
    try {
        console.log('Starting database setup...');
        // Run initial setup
        await runSQLFile('supabase/migrations/initial_setup.sql');
        console.log('Initial setup complete');
        // Run seed file
        await runSQLFile('supabase/seed.sql');
        console.log('Seed data inserted');
        console.log('Database setup completed successfully');
    }
    catch (error) {
        console.error('Database setup failed:', error);
    }
}
// Run the setup
setupDatabase();
