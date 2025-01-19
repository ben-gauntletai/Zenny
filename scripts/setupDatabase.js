import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Supabase client
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

async function runSQLFile(filePath) {
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, '../', filePath), 'utf8');
    console.log(`Executing SQL from ${filePath}...`);
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    // Execute each statement
    for (const statement of statements) {
      console.log('Executing statement:', statement);
      const { error } = await supabase.from('_sql').select('*').eq('query', statement);
      if (error) throw error;
    }
    
    console.log(`Successfully executed ${filePath}`);
  } catch (error) {
    console.error(`Error executing ${filePath}:`, error);
    throw error;
  }
}

async function setupDatabase() {
  try {
    console.log('Starting database setup...');
    
    // Run initial setup
    await runSQLFile('supabase/migrations/20240320000000_initial_setup.sql');
    console.log('Initial setup complete');
    
    // Run seed file
    await runSQLFile('supabase/seed.sql');
    console.log('Seed data inserted');
    
    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Database setup failed:', error);
  }
}

// Run the setup
setupDatabase(); 