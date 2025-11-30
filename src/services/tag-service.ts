import type { TagGraphNode, CatalogProduct } from '../types/index.js';
import { pool } from '../database/db.js';

// Juspay Grid AI endpoint
const GRID_AI_URL = 'https://grid.ai.juspay.net/v1/chat/completions';

// Get API key lazily (after dotenv loads)
function getGridAIKey(): string {
  const key = process.env.GRID_AI_API_KEY || '';
  if (!key) {
    throw new Error('GRID_AI_API_KEY not found in environment variables');
  }
  return key;
}

// Build tag relationship graph using LLM - send all tags at once
export async function buildTagGraphWithLLM(allTags: string[]): Promise<Map<string, string[]>> {
  const tagGraph = new Map<string, string[]>();
  
  console.log(`\n🤖 Building tag graph with LLM for ${allTags.length} unique tags...`);
  console.log(`📊 Sending all tags to LLM in one request...`);
  
  const llmStartTime = Date.now();
  
  try {
    const response = await fetch(GRID_AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getGridAIKey()}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an e-commerce recommendation expert. For each product tag, suggest 3-5 COMPLEMENTARY PRODUCT tags from the provided list that customers typically buy together.

Rules:
- Focus on PRODUCTS that go well together (e.g., "t-shirt" → ["jeans", "sneakers", "jacket"])
- ONLY use tags from the provided list - do not invent new tags
- DO NOT suggest attributes like colors, materials, or styles
- DO NOT suggest the same category
- Think cross-sell: what other PRODUCTS would a customer need?

Return ONLY JSON array: [{"tag": "t-shirt", "related": ["jeans", "sneakers", "jacket"]}]`
          },
          {
            role: 'user',
            content: `Available product tags: ${JSON.stringify(allTags)}\n\nFor EACH tag in the list, suggest 3-5 related tags.`
          }
        ],
        temperature: 0.3,
        max_tokens: 50000
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ Grid AI API Error (${response.status}):`, errorBody);
      throw new Error(`Grid AI error: ${response.status} - ${errorBody}`);
    }
    
    const data = await response.json();
    const llmResponse = data.choices?.[0]?.message?.content || '[]';
    
    // Parse LLM response
    try {
      // Remove markdown code blocks if present
      let jsonText = llmResponse.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedData: Array<{ tag: string; related: string[] }> = JSON.parse(jsonMatch[0]);
        
        for (const item of parsedData) {
          tagGraph.set(item.tag, item.related);
        }
        console.log(`✅ Parsed ${parsedData.length} tag relationships from LLM`);
        console.log(`⏱️  LLM processing time: ${Date.now() - llmStartTime}ms`);
      }
    } catch (e) {
      console.warn(`⚠️  Failed to parse LLM response:`, (e as Error).message);
    }
    
    console.log(`\n✅ Tag graph built with ${tagGraph.size} tags using LLM!\n`);
    
  } catch (error: any) {
    console.error('❌ LLM tag graph generation failed:', error.message);
    console.log('⚠️  Using empty graph\n');
  }
  
  return tagGraph;
}

// Normalize tags using simple rules (can be enhanced with LLM later)
export function normalizeTags(product: CatalogProduct): string[] {
  const tags = new Set<string>();
  
  // Add category as primary tag
  if (product.category) {
    tags.add(product.category.toLowerCase().trim());
  }
  
  // Extract tags from title
  const titleWords = product.title.toLowerCase().split(/[\s-]+/);
  for (const word of titleWords) {
    if (word.length > 3 && !isStopWord(word)) {
      tags.add(word);
    }
  }
  
  // Add vendor as a tag
  if (product.vendor) {
    tags.add(`vendor:${product.vendor.toLowerCase().replace(/\s+/g, '-')}`);
  }
  
  // Add price range tag
  const priceTag = getPriceRangeTag(product.price);
  tags.add(priceTag);
  
  // Add existing tags if any
  if (product.tags && Array.isArray(product.tags)) {
    product.tags.forEach(tag => tags.add(tag.toLowerCase().trim()));
  }
  
  return Array.from(tags);
}

function isStopWord(word: string): boolean {
  const stopWords = ['the', 'and', 'for', 'with', 'from', 'this', 'that', 'pack'];
  return stopWords.includes(word);
}

function getPriceRangeTag(price: number): string {
  if (price < 30) return 'price:budget';
  if (price < 75) return 'price:mid';
  if (price < 150) return 'price:premium';
  return 'price:luxury';
}

// Get related tags from the graph
export async function getRelatedTags(
  tags: string[],
  recommendationType: 'upsell' | 'crosssell' = 'crosssell',
  maxTags: number = 50
): Promise<string[]> {
  const client = await pool.connect();
  
  try {
    const relatedTagsSet = new Set<string>();
    
    for (const tag of tags) {
      const result = await client.query(
        'SELECT children FROM tag_graph WHERE tag_name = $1',
        [tag]
      );
      
      if (result.rows.length > 0) {
        const children: string[] = result.rows[0].children; // Now just an array of strings
        children.forEach(child => relatedTagsSet.add(child));
      }
    }
    
    // Return unique related tags
    return Array.from(relatedTagsSet).slice(0, maxTags);
  } catch (error) {
    console.error('❌ Error getting related tags:', error);
    return [];
  } finally {
    client.release();
  }
}
