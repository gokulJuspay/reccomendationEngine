import { pool } from '../database/db.js';
import type { CatalogProduct, ProcessTracker, TagGraphNode } from '../types/index.js';
import { buildTagGraphWithLLM } from './tag-service.js';
import { batchGenerateEmbeddings } from './embedding-service.js';
import { config } from '../config.js';

export async function runPrecomputation(shopId: string, forceRebuild: boolean = false): Promise<void> {
  const client = await pool.connect();
  let trackerId: number | null = null;
  const overallStartTime = Date.now();
  
  try {
    // Create process tracker entry
    const trackerResult = await client.query(
      `INSERT INTO process_tracker (shop_id, status, product_count, started_at, last_run)
       VALUES ($1, 'running', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [shopId]
    );
    trackerId = trackerResult.rows[0].id;
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 STARTING PRECOMPUTATION');
    console.log('='.repeat(60));
    console.log(`Shop ID: ${shopId}`);
    console.log(`Using: Juspay Grid AI (https://grid.ai.juspay.net)`);
    console.log('='.repeat(60) + '\n');
    
    // Step 1: Load products from catalog
    console.log('📦 STEP 1: Loading product catalog...');
    const step1Start = Date.now();
    const products = await loadProductCatalog(shopId);
    console.log(`⏱️  STEP 1 completed in ${Date.now() - step1Start}ms`);
    console.log(`✅ Loaded ${products.length} products\n`);
    
    await client.query(
      'UPDATE process_tracker SET product_count = $1 WHERE id = $2',
      [products.length, trackerId]
    );
    
    // Step 2: Process products with LLM (embeddings + tags in batches of 50)
    console.log('🤖 STEP 2: Processing products with LLM (batches of 50)...');
    console.log('   - Generating embeddings');
    console.log('   - Extracting enhanced tags');
    const step2Start = Date.now();
    const productData = await batchGenerateEmbeddings(products);
    console.log(`⏱️  STEP 2 completed in ${Date.now() - step2Start}ms`);
    
    // Step 3: Save everything to database
    console.log('\n💾 STEP 3: Saving products, embeddings, and tags to database...');
    const step3Start = Date.now();
    await saveProductsWithData(client, shopId, products, productData);
    console.log(`⏱️  STEP 3 completed in ${Date.now() - step3Start}ms`);
    console.log(`✅ Saved ${products.length} products with embeddings and tags\n`);
    
    // Step 4: Compute product scores
    console.log('📊 STEP 4: Computing merchant and purchase scores...');
    const step4Start = Date.now();
    await computeProductScores(client, shopId);
    console.log(`⏱️  STEP 4 completed in ${Date.now() - step4Start}ms`);
    console.log('✅ Scores computed\n');
    
    // Step 5: Collect all unique tags from DATABASE (not from memory)
    console.log('🏷️  STEP 5: Collecting all unique tags from database...');
    const step5Start = Date.now();
    const tagsResult = await client.query(
      `SELECT DISTINCT tags as tag FROM products WHERE shop_id = $1 AND tags IS NOT NULL`,
      [shopId]
    );
    const uniqueTags = tagsResult.rows.map(row => row.tag);
    console.log(`⏱️  STEP 5 completed in ${Date.now() - step5Start}ms`);
    console.log(`✅ Found ${uniqueTags.length} unique tags from database\n`);
    
    // Step 6: Build tag graph with LLM (send all tags at once)
    console.log('🔗 STEP 6: Building tag relationship graph with LLM...');
    const step6Start = Date.now();
    const tagGraph = await buildTagGraphWithLLM(uniqueTags);
    
    // Save tag graph to database
    console.log('💾 Saving tag graph to database...');
    const dbSaveStart = Date.now();
    await saveTagGraphToDatabase(client, tagGraph);
    console.log(`⏱️  Database save time: ${Date.now() - dbSaveStart}ms`);
    console.log(`⏱️  STEP 6 total time: ${Date.now() - step6Start}ms`);
    console.log(`✅ Tag graph saved with ${tagGraph.size} tags\n`);
    
    // Mark process as completed
    await client.query(
      `UPDATE process_tracker 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [trackerId]
    );
    
    const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
    const totalTime = Date.now() - overallStartTime;
    console.log('\n' + '='.repeat(60));
    console.log('✅ PRECOMPUTATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`   Shop ID: ${shopId}`);
    console.log(`   Products processed: ${products.length}`);
    console.log(`   Total variants: ${totalVariants}`);
    console.log(`   Unique tags: ${uniqueTags.length}`);
    console.log(`   Tag relationships: ${tagGraph.size}`);
    console.log(`   Status: Ready for recommendations`);
    console.log(`   ⏱️  Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log('='.repeat(60) + '\n');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('\n' + '❌'.repeat(30));
    console.error('❌ PRECOMPUTATION FAILED');
    console.error('❌'.repeat(30));
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    console.error('❌'.repeat(30) + '\n');
    
    // Mark process as failed
    if (trackerId) {
      await client.query(
        'UPDATE process_tracker SET status = $1 WHERE id = $2',
        ['failed', trackerId]
      );
    }
    
    throw error;
  } finally {
    client.release();
  }
}

// Load products from the JSON catalog
async function loadProductCatalog(shopId: string): Promise<CatalogProduct[]> {
  // In production, this would load from S3 or Shopify API
  // For now, we'll load from our local JSON file
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const catalogPath = path.join(process.cwd(), 'src', 'data', 'products.json');
  const catalogData = await fs.readFile(catalogPath, 'utf-8');
  const catalog = JSON.parse(catalogData);
  
  return catalog.products.map((p: any) => ({
    ...p,
    status: p.status || 'active',
    stock: calculateStock(p.variants),
    tags: p.tags || [],
  }));
}

function calculateStock(variants: any[]): number {
  return variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
}

// Save products with embeddings and tags all at once
async function saveProductsWithData(
  client: any,
  shopId: string,
  products: CatalogProduct[],
  productData: Map<number, { embedding: number[]; tags: string[] }>
): Promise<void> {
  for (const product of products) {
    const data = productData.get(product.id);
    if (!data) continue;
    
    // Store only the first tag as a plain string
    const primaryTag = data.tags[0] || 'product';
    
    await client.query(
      `INSERT INTO products (
        id, shop_id, title, category, tags, weight, vendor, price, variants, 
        status, stock, merchant_score, purchase_score, embedding, embedding_version,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        shop_id = $2,
        title = $3,
        category = $4,
        tags = $5,
        weight = $6,
        vendor = $7,
        price = $8,
        variants = $9,
        status = $10,
        stock = $11,
        embedding = $14,
        embedding_version = $15,
        updated_at = CURRENT_TIMESTAMP`,
      [
        product.id,
        shopId,
        product.title,
        product.category,
        primaryTag, // LLM-generated tags
        product.weight || 1.0,
        product.vendor,
        product.price,
        JSON.stringify(product.variants),
        product.status,
        product.stock,
        product.merchant_score || 0,
        product.purchase_score || 0,
        data.embedding, // LLM-generated embedding
        config.embedding.version,
      ]
    );
  }
}

// Save tag graph to database
async function saveTagGraphToDatabase(
  client: any,
  tagGraph: Map<string, string[]>
): Promise<void> {
  for (const [tagName, children] of tagGraph) {
    // Validate children array - remove any invalid entries
    const validChildren = children.filter(c => c && typeof c === 'string' && c.trim().length > 0);
    
    if (validChildren.length === 0) {
      console.log(`⚠️  Skipping tag "${tagName}" - no valid children`);
      continue;
    }
    
    try {
      await client.query(
        `INSERT INTO tag_graph (tag_name, children, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (tag_name) 
         DO UPDATE SET children = $2, updated_at = CURRENT_TIMESTAMP`,
        [tagName, validChildren]
      );
    } catch (error: any) {
      console.error(`❌ Failed to save tag "${tagName}":`, error.message);
      console.error(`   Children:`, JSON.stringify(validChildren));
      throw error;
    }
  }
}

async function computeProductScores(client: any, shopId: string): Promise<void> {
  // Compute merchant score based on stock and availability
  await client.query(
    `UPDATE products 
     SET merchant_score = CASE
       WHEN stock > 50 THEN 1.0
       WHEN stock > 20 THEN 0.7
       WHEN stock > 0 THEN 0.4
       ELSE 0.1
     END
     WHERE shop_id = $1`,
    [shopId]
  );
  
  // Compute purchase score (simulated - in production, use real purchase data)
  await client.query(
    `UPDATE products 
     SET purchase_score = RANDOM() * 0.5 + 0.5
     WHERE shop_id = $1`,
    [shopId]
  );
}
