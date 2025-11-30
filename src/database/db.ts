import pkg from 'pg';
const { Pool } = pkg;
import { config } from '../config.js';

export const pool = new Pool(config.database);
let isClosing = false;

// Database initialization
export async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    // Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGINT PRIMARY KEY,
        shop_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT,
        tags TEXT,
        weight NUMERIC,
        vendor TEXT,
        price NUMERIC NOT NULL,
        variants JSONB NOT NULL,
        status TEXT DEFAULT 'active',
        stock INT DEFAULT 0,
        merchant_score FLOAT DEFAULT 0.0,
        purchase_score FLOAT DEFAULT 0.0,
        embedding FLOAT[],
        embedding_version TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index on shop_id and tags
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_tags ON products(tags);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    `);

    // Create tag_graph table - children is now TEXT[] instead of JSONB
    await client.query(`
      CREATE TABLE IF NOT EXISTS tag_graph (
        tag_name TEXT PRIMARY KEY,
        children TEXT[] NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create process_tracker table
    await client.query(`
      CREATE TABLE IF NOT EXISTS process_tracker (
        id SERIAL PRIMARY KEY,
        shop_id TEXT NOT NULL,
        status TEXT NOT NULL,
        product_count INT DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        last_run TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  if (!isClosing) {
    isClosing = true;
    try {
      await pool.end();
      console.log('✅ Database connection closed');
    } catch (error) {
      console.error('⚠️  Error closing database:', error);
    }
  }
}
