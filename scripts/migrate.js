const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Get database URL from environment variable
require('dotenv').config();
const databaseUrl = process.env.DATABASE_URL;

async function dropAllTables(client) {
  console.log('Dropping existing tables and types...');
  
  // Drop tables with dependencies first
  await client.query(`
    DROP TABLE IF EXISTS article_feedback CASCADE;
    DROP TABLE IF EXISTS article_views CASCADE;
    DROP TABLE IF EXISTS ticket_comments CASCADE;
    DROP TABLE IF EXISTS tickets CASCADE;
    DROP TABLE IF EXISTS knowledge_base_articles CASCADE;
  `);

  // Drop enum types
  await client.query(`
    DROP TYPE IF EXISTS ticket_status CASCADE;
    DROP TYPE IF EXISTS ticket_priority CASCADE;
  `);
}

async function runMigrations() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Get all migration files
    const migrationsDir = path.join(__dirname, '../supabase/migrations');
    const files = await fs.readdir(migrationsDir);
    
    // Sort files to ensure correct order
    const migrationFiles = files
      .filter(file => file.endsWith('.sql'))
      .filter(file => !file.includes('initial_schema')) // Skip the combined schema file
      .sort();

    console.log('Found migration files:', migrationFiles);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Drop existing tables and types
      await dropAllTables(client);
      
      // Run each migration
      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, 'utf-8');
        
        console.log(`Running migration: ${file}`);
        
        try {
          await client.query(sql);
          console.log(`Successfully applied migration: ${file}`);
        } catch (error) {
          console.error(`Error applying migration ${file}:`, error.message);
          throw error;
        }
      }

      await client.query('COMMIT');
      console.log('All migrations completed successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations(); 