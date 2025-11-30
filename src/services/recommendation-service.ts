import { pool } from '../database/db.js';
import type { ScoredProduct } from '../types/index.js';
import { getRelatedTags } from './tag-service.js';
import { config } from '../config.js';
import { NeuroLink } from "@juspay/neurolink";

// API endpoints
const GRID_AI_URL = 'https://grid.ai.juspay.net/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/chat/completions';

// Check if Neurolink should be used
function shouldUseNeurolink(): boolean {
  const useNeurolink = process.env.USE_NEUROLINK?.toLowerCase();
  return useNeurolink === 'true';
}

// Get API configuration for recommendations (URL and key)
function getRecommendationsAPIConfig(): { url: string; apiKey: string; useNeurolink: boolean } {
  // Check if Neurolink is enabled
  if (shouldUseNeurolink()) {
    console.log('🔑 Using Neurolink for recommendations');
    return {
      url: '', // Neurolink doesn't use URL
      apiKey: '',
      useNeurolink: true
    };
  }
  
  // Try recommendations-specific Gemini key
  const recommendationsKey = process.env.RECOMMENDATIONS_API_KEY;
  if (recommendationsKey && recommendationsKey.trim()) {
    console.log('🔑 Using RECOMMENDATIONS_API_KEY with Gemini API');
    return {
      url: GEMINI_URL,
      apiKey: recommendationsKey,
      useNeurolink: false
    };
  }
  
  // Fall back to general Grid AI key
  const gridKey = process.env.GRID_AI_API_KEY || '';
  if (!gridKey) {
    throw new Error('No API key found: set USE_NEUROLINK=true, RECOMMENDATIONS_API_KEY, or GRID_AI_API_KEY');
  }
  console.log('🔑 Using GRID_AI_API_KEY with Grid AI endpoint');
  return {
    url: GRID_AI_URL,
    apiKey: gridKey,
    useNeurolink: false
  };
}

/**
 * Get recommendations for given product IDs
 * @param shopId - Shop identifier
 * @param productIds - Array of product IDs from request
 * @param recommendationType - Type of recommendations needed
 */
export async function getRecommendations(
  shopId: string,
  productIds: number[],
  recommendationType: Array<'upsell' | 'crosssell'> = ['upsell', 'crosssell']
): Promise<{ upsell: ScoredProduct[]; crosssell: ScoredProduct[] }> {
  const client = await pool.connect();
  const startTime = Date.now();
  
  try {
    console.log(`\n🎯 Getting recommendations for product IDs: ${productIds.join(', ')}`);
    
    // Step 1: Query DB for products and extract their tags
    console.log('📊 STEP 1: Querying products from DB...');
    const step1Start = Date.now();
    const sourceProducts = await getProductsByIds(client, productIds);
    console.log(`⏱️  STEP 1 completed in ${Date.now() - step1Start}ms`);
    
    if (sourceProducts.length === 0) {
      throw new Error('No products found for given IDs');
    }
    
    // Collect all tags from source products (tags is now a single string, not array)
    const allSourceTags = new Set<string>();
    sourceProducts.forEach(p => {
      if (p.tags) {
        allSourceTags.add(p.tags);
      }
    });
    
    const sourceTags = Array.from(allSourceTags);
    console.log(`🏷️  Found ${sourceTags.length} tags: ${sourceTags.slice(0, 10).join(', ')}...`);
    
    // Step 2: Query tag_graph for related tags
    console.log('\n🔗 STEP 2: Querying tag graph for related tags...');
    const step2Start = Date.now();
    const relatedTags = await getRelatedTags(sourceTags, 'crosssell', 50);
    console.log(`⏱️  STEP 2 completed in ${Date.now() - step2Start}ms`);
    console.log(`✅ Found ${relatedTags.length} related tags: ${relatedTags.slice(0, 10).join(', ')}...`);
    
    // Step 3: Query DB for products with related tags, get top 100 by score
    console.log('\n📦 STEP 3: Fetching top 100 candidate products...');
    const step3Start = Date.now();
    const candidateProducts = await getCandidateProductsByTags(
      client,
      shopId,
      relatedTags,
      productIds, // Exclude source products
      100
    );
    console.log(`⏱️  STEP 3 completed in ${Date.now() - step3Start}ms`);
    console.log(`✅ Found ${candidateProducts.length} candidate products`);
    
    if (candidateProducts.length === 0) {
      console.log('⚠️  No candidates found, returning empty results');
      return { upsell: [], crosssell: [] };
    }
    
    // Step 4: Use LLM to find nearest embeddings (most matching products)
    console.log('\n🤖 STEP 4: Using LLM to find nearest embeddings...');
    const step4Start = Date.now();
    const rankedProducts = await findNearestProductsWithLLM(
      sourceProducts,
      candidateProducts,
      recommendationType
    );
    console.log(`⏱️  STEP 4 completed in ${Date.now() - step4Start}ms`);
    
    const totalRanked = rankedProducts.upsell.length + rankedProducts.crosssell.length;
    console.log(`✅ LLM ranked ${totalRanked} products (${rankedProducts.upsell.length} upsell, ${rankedProducts.crosssell.length} crosssell)`);
    console.log(`\n⏱️  TOTAL TIME: ${Date.now() - startTime}ms\n`);

    return rankedProducts;
  } catch (error) {
    console.error('❌ Error generating recommendations:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Step 1: Get products by IDs from database
async function getProductsByIds(client: any, productIds: number[]): Promise<any[]> {
  const result = await client.query(
    `SELECT id, title, category, price, vendor, tags, embedding
     FROM products
     WHERE id = ANY($1::bigint[])`,
    [productIds]
  );
  
  return result.rows;
}

// Step 3: Get candidate products by related tags, sorted by score
async function getCandidateProductsByTags(
  client: any,
  shopId: string,
  tags: string[],
  excludeIds: number[],
  limit: number = 100
): Promise<any[]> {
  console.log(`🔍 DEBUG: Querying with tags:`, tags);
  console.log(`🔍 DEBUG: Exclude IDs:`, excludeIds);
  console.log(`🔍 DEBUG: Parameters:`, { shopId, excludeIds, tags, limit });
  
  // Query products that have matching tags
  // Sort by merchant_score (highest stock/availability gets priority)
  const query = `SELECT 
      id, title, category, price, vendor, variants, tags,
      merchant_score, purchase_score, embedding, stock
     FROM products
     WHERE shop_id = $1
       AND id != ALL($2::bigint[])
       AND status = 'active'
       AND stock > 0
       AND tags = ANY($3::text[])
     ORDER BY (merchant_score * 0.6 + purchase_score * 0.4) DESC
     LIMIT $4`;
  
  console.log(`🔍 DEBUG: SQL Query:`, query);
  console.log(`🔍 DEBUG: Query params:`, [shopId, excludeIds, tags, limit]);
  
  const result = await client.query(query, [shopId, excludeIds, tags, limit]);
  
  console.log(`🔍 DEBUG: Found ${result.rows.length} products`);
  if (result.rows.length > 0) {
    console.log(`🔍 DEBUG: First product:`, result.rows[0].id, result.rows[0].title, result.rows[0].tags);
  }
  
  return result.rows;
}

// Step 4: Use LLM to find nearest embeddings and rank products
async function findNearestProductsWithLLM(
  sourceProducts: any[],
  candidates: any[],
  recommendationType: Array<'upsell' | 'crosssell'>
): Promise<{ upsell: ScoredProduct[]; crosssell: ScoredProduct[] }> {
  try {
    // Prepare source products info
    const sourceInfo = sourceProducts.map(p => 
      `${p.title} (${p.category || 'N/A'}) - $${p.price}`
    ).join(', ');
    
    // Prepare candidate list with embeddings
    const candidateList = candidates.map((p, idx) => ({
      index: idx,
      id: p.id,
      title: p.title,
      category: p.category,
      price: p.price,
      vendor: p.vendor,
      variants: p.variants, // Already parsed from JSONB
      embedding: p.embedding,
      merchant_score: p.merchant_score || 0,
      purchase_score: p.purchase_score || 0
    }));
    
    // Build prompt for LLM
    const candidateText = candidateList.map((p) => 
      `ID: ${p.id} - ${p.title} (${p.category}) - $${p.price} by ${p.vendor}`
    ).join('\n');
    
    const prompt = `You are an e-commerce recommendation expert. A customer is viewing these products:
${sourceInfo}

From the following ${candidates.length} products, select the MOST relevant recommendations by their ID numbers:

${candidateText}

Analyze based on:
1. Embedding similarity (semantic matching)
2. Complementary fit (what goes well together)
3. Price appropriateness
4. Category relevance

For each recommendation type, select the best product ID NUMBERS:
- Upsell: Same/similar category, higher value (up to 10 products)
- Crosssell: Complementary products, different category (up to 10 products)

IMPORTANT: Return NUMERIC IDs only (e.g., 1001, 1002), NOT category names or strings.

Return ONLY valid JSON with numeric arrays:
{
  "upsell": [1001, 1002],
  "crosssell": [1003, 1004]
}`;

    const apiConfig = getRecommendationsAPIConfig();
    
    let llmResponse: string;
    
    // Use Neurolink or API-based LLM
    if (apiConfig.useNeurolink) {
      // Neurolink call
      const neurolink = new NeuroLink();
      const result = await neurolink.generate({
        input: { text: prompt },
        disableTools: true,
        maxTokens: 1200
      });
      llmResponse = result.content;
    } else {
      // API-based LLM call
      const response = await fetch(apiConfig.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.5-flash-lite',
          messages: [
            {
              role: 'system',
              content: 'You are a product recommendation expert. Return only valid JSON with product IDs.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ API Error (${response.status}):`, errorBody);
        throw new Error(`API error: ${response.status} - ${errorBody}`);
      }

      const data = await response.json();
      console.log('🔍 DEBUG: API response:', JSON.stringify(data, null, 2));
      
      llmResponse = data.choices?.[0]?.message?.content || '{}';
    }
    
    console.log('🔍 DEBUG: LLM response content:', llmResponse);
    console.log('🔍 DEBUG: LLM response type:', typeof llmResponse);
    
    // Parse LLM response - strip markdown if present
    let jsonText = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse);
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ No JSON found in response:', jsonText);
      throw new Error('Failed to parse LLM response - no JSON found');
    }
    
    console.log('🔍 DEBUG: Extracted JSON:', jsonMatch[0]);
    const recommendations: { upsell: number[]; crosssell: number[] } = JSON.parse(jsonMatch[0]);
    
    console.log('🔍 DEBUG: Recommendations from LLM:', recommendations);
    console.log('🔍 DEBUG: Candidate IDs available:', candidateList.map(c => c.id));
    
    // Convert IDs to scored products
    const upsell: ScoredProduct[] = [];
    const crosssell: ScoredProduct[] = [];
    
    for (const productId of recommendations.upsell || []) {
      console.log(`🔍 DEBUG: Looking for upsell product ID ${productId}`);
      // Convert both to numbers for comparison (pg returns bigint as string)
      const candidate = candidateList.find(c => Number(c.id) === Number(productId));
      if (candidate) {
        console.log(`✅ Found upsell product: ${candidate.title}`);
        // For each variant
        for (const variant of candidate.variants) {
          upsell.push({
            id: candidate.id,
            title: candidate.title,
            variant_id: variant.id,
            variant_title: variant.title,
            category: candidate.category,
            price: variant.price,
            vendor: candidate.vendor,
            score: 0.9, // High score from LLM recommendation
            embedding_similarity: 0.85,
            merchant_score: candidate.merchant_score,
            purchase_score: candidate.purchase_score,
            price_similarity: 0.8
          });
        }
      }
    }
    
    for (const productId of recommendations.crosssell || []) {
      console.log(`🔍 DEBUG: Looking for crosssell product ID ${productId}`);
      // Convert both to numbers for comparison (pg returns bigint as string)
      const candidate = candidateList.find(c => Number(c.id) === Number(productId));
      if (candidate) {
        console.log(`✅ Found crosssell product: ${candidate.title}`);
        // For each variant
        for (const variant of candidate.variants) {
          crosssell.push({
            id: candidate.id,
            title: candidate.title,
            variant_id: variant.id,
            variant_title: variant.title,
            category: candidate.category,
            price: variant.price,
            vendor: candidate.vendor,
            score: 0.85,
            embedding_similarity: 0.8,
            merchant_score: candidate.merchant_score,
            purchase_score: candidate.purchase_score,
            price_similarity: 0.75
          });
        }
      }
    }
    
    return {
      upsell: upsell.slice(0, config.limits.final_recommendations),
      crosssell: crosssell.slice(0, config.limits.final_recommendations)
    };
    
  } catch (error: any) {
    console.error('❌ LLM recommendation failed:', error.message);
    console.log('⚠️  Falling back to simple scoring...');
    
    // Fallback: Use simple merchant score ranking
    const upsell: ScoredProduct[] = [];
    const crosssell: ScoredProduct[] = [];
    
    for (const candidate of candidates.slice(0, 20)) {
      const variants = candidate.variants; // Already parsed from JSONB
      const avgPrice = sourceProducts.reduce((sum, p) => sum + p.price, 0) / sourceProducts.length;
      
      for (const variant of variants) {
        const scored: ScoredProduct = {
          id: candidate.id,
          title: candidate.title,
          variant_id: variant.id,
          variant_title: variant.title,
          category: candidate.category,
          price: variant.price,
          vendor: candidate.vendor,
          score: candidate.merchant_score || 0.5,
          embedding_similarity: 0.7,
          merchant_score: candidate.merchant_score || 0.5,
          purchase_score: candidate.purchase_score || 0.5,
          price_similarity: 0.6
        };
        
        // Simple categorization
        const isSameCategory = sourceProducts.some(p => p.category === candidate.category);
        const isHigherPrice = variant.price >= avgPrice;
        
        if (isSameCategory && isHigherPrice) {
          upsell.push(scored);
        } else {
          crosssell.push(scored);
        }
      }
    }
    
    return {
      upsell: upsell.slice(0, config.limits.final_recommendations),
      crosssell: crosssell.slice(0, config.limits.final_recommendations)
    };
  }
}