const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Get database URL from environment variable
require('dotenv').config();
const databaseUrl = process.env.DATABASE_URL;

async function createTestUser(client) {
  console.log('Creating test user...');
  
  // Create a test user in auth.users
  const createUserResult = await client.query(`
    INSERT INTO auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      'test@example.com',
      '$2a$10$abcdefghijklmnopqrstuvwxyz123456789',
      NOW(),
      '{"role": "agent"}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE
    SET raw_user_meta_data = EXCLUDED.raw_user_meta_data
    RETURNING id;
  `);

  return createUserResult.rows[0].id;
}

async function seedDatabase() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Read the seed file
    const seedFile = path.join(__dirname, '../supabase/seed.sql');
    const sql = await fs.readFile(seedFile, 'utf-8');
    
    console.log('Running seed file...');
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create test user first
      const userId = await createTestUser(client);
      console.log('Created test user with ID:', userId);
      
      // Replace auth.uid() with the test user ID
      const modifiedSql = sql.replace(/auth\.uid\(\)/g, `'${userId}'`);
      
      await client.query(modifiedSql);
      await client.query('COMMIT');
      console.log('Successfully seeded database');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error seeding database:', error.message);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run seed
seedDatabase(); 