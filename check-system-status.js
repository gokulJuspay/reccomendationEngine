#!/usr/bin/env node

/**
 * System Status Checker
 * Diagnoses the recommendation engine and shows what's working/missing
 */

import pkg from 'pg';
const { Pool } = pkg;
import { config } from './dist/config.js';

const pool = new Pool(config.database);

console.log('🔍 RECOMMENDATION ENGINE DIAGNOSTIC\n');
console.log('='.repeat(60));

async function checkSystem() {
  try {
    // 1. Check database connection
    console.log('\n1️⃣  Database Connection');
    console.log('─'.repeat(60));
    try {
      await pool.query('SELECT 1');
      console.log('✅ Connected to PostgreSQL');
      console.log(`   Database: ${config.database.database}`);
      console.log(`   User: ${config.database.user}`);
    } catch (error) {
      console.log('❌ Database connection failed:', error.message);
      process.exit(1);
    }

    // 2. Check products table
    console.log('\n2️⃣  Products Table');
    console.log('─'.repeat(60));
    const productResult = await pool.query('SELECT COUNT(*) as count FROM products');
    const productCount = parseInt(productResult.rows[0].count);
    console.log(`📦 Total products: ${productCount}`);

    const withEmbeddings = await pool.query('SELECT COUNT(*) as count FROM products WHERE embedding IS NOT NULL');
    const embeddingCount = parseInt(withEmbeddings.rows[0].count);
    console.log(`🧠 Products with embeddings: ${embeddingCount}`);
    
    if (embeddingCount === 0 && productCount > 0) {
      console.log('⚠️  WARNING: No products have embeddings! Run precomputation.');
    } else if (embeddingCount > 0) {
      console.log(`✅ ${((embeddingCount/productCount)*100).toFixed(1)}% of products have embeddings`);
    }

    // Check embedding dimensions
    if (embeddingCount > 0) {
      const sampleEmbed = await pool.query('SELECT array_length(embedding, 1) as dim FROM products WHERE embedding IS NOT NULL LIMIT 1');
      console.log(`   Embedding dimensions: ${sampleEmbed.rows[0].dim}`);
    }

    // 3. Check tag graph
    console.log('\n3️⃣  Tag Graph (Relationships)');
    console.log('─'.repeat(60));
    const tagResult = await pool.query('SELECT COUNT(*) as count FROM tag_graph');
    const tagCount = parseInt(tagResult.rows[0].count);
    console.log(`🔗 Total tags in graph: ${tagCount}`);

    if (tagCount === 0) {
      console.log('❌ PROBLEM: Tag graph is EMPTY!');
      console.log('   This means cross-sell recommendations won\'t work properly.');
      console.log('   Solution: Run precomputation with force_rebuild: true');
    } else {
      console.log(`✅ Tag graph populated`);
      
      // Show sample relationships
      const sampleTags = await pool.query(`
        SELECT tag_name, children 
        FROM tag_graph 
        WHERE tag_name IN ('t-shirt', 'pants', 'dress', 'activewear', 'jacket')
        LIMIT 5
      `);
      
      if (sampleTags.rows.length > 0) {
        console.log('\n   Sample relationships:');
        for (const row of sampleTags.rows) {
          const children = JSON.parse(row.children);
          const topRelated = children.slice(0, 3).map(c => c.tag_name).join(', ');
          console.log(`   • ${row.tag_name} → ${topRelated}...`);
        }
      }
    }

    // 4. Check process tracker
    console.log('\n4️⃣  Precomputation Status');
    console.log('─'.repeat(60));
    const trackerResult = await pool.query(`
      SELECT shop_id, status, product_count, started_at, completed_at 
      FROM process_tracker 
      ORDER BY started_at DESC 
      LIMIT 3
    `);
    
    if (trackerResult.rows.length === 0) {
      console.log('📭 No precomputation runs found');
      console.log('   Run: curl -X POST http://localhost:3000/api/precompute \\');
      console.log('              -H "Content-Type: application/json" \\');
      console.log('              -d \'{"shop_id": "test_shop", "force_rebuild": true}\'');
    } else {
      console.log('Recent precomputation runs:');
      for (const run of trackerResult.rows) {
        const status = run.status === 'completed' ? '✅' : 
                      run.status === 'running' ? '🔄' : '❌';
        console.log(`   ${status} ${run.shop_id} - ${run.status} (${run.product_count} products)`);
        console.log(`      Started: ${new Date(run.started_at).toLocaleString()}`);
        if (run.completed_at) {
          console.log(`      Completed: ${new Date(run.completed_at).toLocaleString()}`);
        }
      }
    }

    // 5. Overall system status
    console.log('\n' + '='.repeat(60));
    console.log('📊 OVERALL STATUS');
    console.log('='.repeat(60));
    
    const issues = [];
    const working = [];
    
    if (productCount === 0) {
      issues.push('No products in database');
    } else {
      working.push(`${productCount} products loaded`);
    }
    
    if (embeddingCount === 0 && productCount > 0) {
      issues.push('Products missing embeddings');
    } else if (embeddingCount > 0) {
      working.push(`${embeddingCount} products have embeddings`);
    }
    
    if (tagCount === 0) {
      issues.push('Tag graph is empty (cross-sell won\'t work)');
    } else {
      working.push(`Tag graph has ${tagCount} tags`);
    }
    
    if (working.length > 0) {
      console.log('\n✅ Working:');
      working.forEach(w => console.log(`   • ${w}`));
    }
    
    if (issues.length > 0) {
      console.log('\n❌ Issues:');
      issues.forEach(i => console.log(`   • ${i}`));
      console.log('\n💡 SOLUTION:');
      console.log('   1. Get valid Google AI API key from https://aistudio.google.com/app/apikey');
      console.log('   2. Update .env file: GOOGLE_AI_API_KEY=your_new_key');
      console.log('   3. Restart server: pnpm dev');
      console.log('   4. Run precomputation: curl -X POST http://localhost:3000/api/precompute \\');
      console.log('                                -H "Content-Type: application/json" \\');
      console.log('                                -d \'{"shop_id": "test_shop", "force_rebuild": true}\'');
    } else {
      console.log('\n🎉 System is fully operational!');
      console.log('   Ready to serve recommendations.');
      console.log('\n📝 Test recommendations:');
      console.log('   curl -X POST http://localhost:3000/api/recommendations \\');
      console.log('        -H "Content-Type: application/json" \\');
      console.log('        -d @test-request.json');
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkSystem().catch(console.error);
