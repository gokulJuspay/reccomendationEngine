import type { CatalogProduct } from '../types/index.js';
import { config } from '../config.js';

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

// Batch process products with LLM - send 50 at once
export async function batchProcessProductsWithLLM(
  products: CatalogProduct[]
): Promise<Array<{ id: number; embedding: number[]; tags: string[]; semanticDescription: string }>> {
  const results: Array<{ id: number; embedding: number[]; tags: string[]; semanticDescription: string }> = [];
  
  try {
    // Create prompt with all 50 products
    const productsJson = products.map(p => ({
      id: p.id,
      title: p.title,
      category: p.category,
      vendor: p.vendor,
      price: p.price,
      tags: p.tags || []
    }));
    
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
            content: `You are a product analysis AI. For each product, generate:
1. Single primary product type tag based on the TITLE (e.g., "t-shirt", "jeans", "sneakers", "jacket", "hoodie", "dress", "shorts") - identify what product it actually is from the title
2. Semantic description (15-20 words capturing essence)

Return ONLY valid JSON array with this exact structure:
[{"id": 1, "tags": ["t-shirt"], "description": "semantic description here"}]

IMPORTANT: Analyze the product TITLE to determine the actual product type. Ignore the category field.`
          },
          {
            role: 'user',
            content: `Analyze these ${products.length} products:\n${JSON.stringify(productsJson, null, 2)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 16000
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
    let parsedData: Array<{ id: number; tags: string[]; description: string }> = [];
    try {
      // Remove markdown code blocks if present
      let jsonText = llmResponse.trim();
      if (jsonText.startsWith('```')) {
        // Remove ```json at start and ``` at end
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      
      // Extract JSON array
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
        console.log(`✅ Parsed ${parsedData.length} products from LLM`);
      } else {
        console.warn('⚠️  No JSON array found in LLM response');
      }
    } catch (e) {
      console.warn('⚠️  Failed to parse LLM response:', (e as Error).message);
    }
    
    // Process each product
    for (const product of products) {
      const llmData = parsedData.find(d => d.id === product.id);
      const tags = llmData?.tags || extractFallbackTags(product);
      const description = llmData?.description || createProductText(product);
      
      // Generate embedding from semantic description + original text
      const embedding = generateEmbeddingFromText(description + ' ' + createProductText(product));
      
      results.push({
        id: product.id,
        embedding,
        tags,
        semanticDescription: description
      });
    }
    
  } catch (error: any) {
    console.error('❌ LLM batch processing failed:', error.message);
    // Fallback: process without LLM
    for (const product of products) {
      results.push({
        id: product.id,
        embedding: generateEmbeddingFromText(createProductText(product)),
        tags: extractFallbackTags(product),
        semanticDescription: createProductText(product)
      });
    }
  }
  
  return results;
}

// Extract tags without LLM (fallback)
function extractFallbackTags(product: CatalogProduct): string[] {
  // Use only the category as the primary product tag
  if (product.category) {
    return [product.category.toLowerCase()];
  }
  
  // If no category, extract from title (first meaningful word)
  const words = product.title.toLowerCase().split(/[\s-]+/);
  for (const word of words) {
    if (word.length > 3 && !isStopWord(word)) {
      return [word];
    }
  }
  
  // Last resort
  return ['product'];
}

function isStopWord(word: string): boolean {
  const stopWords = ['the', 'and', 'for', 'with', 'from', 'this', 'that', 'pack', 'new'];
  return stopWords.includes(word);
}

// Create a text representation of the product for embedding
function createProductText(product: CatalogProduct): string {
  const parts = [
    product.title,
    product.category,
    product.vendor,
    `price: $${product.price}`,
  ];
  
  if (product.tags) {
    parts.push(`tags: ${product.tags.join(', ')}`);
  }
  
  return parts.filter(Boolean).join(' | ');
}

// Fallback embedding generation using text hashing with better semantic distribution
function generateEmbeddingFromText(text: string): number[] {
  const dimensions = config.embedding.dimensions;
  const embedding = new Array(dimensions).fill(0);
  
  // Create a more sophisticated embedding based on text characteristics
  const words = text.toLowerCase().split(/\s+/);
  
  // Use multiple hash functions for better distribution
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      
      // Multiple hash functions
      const index1 = (charCode * (i + 1) * (j + 1)) % dimensions;
      const index2 = ((charCode * 31 + i * 17 + j * 13) % dimensions);
      const index3 = ((charCode ^ (i << 2) ^ (j << 3)) % dimensions);
      
      embedding[index1] += Math.sin(charCode + i + j) * 0.3;
      embedding[index2] += Math.cos(charCode * i) * 0.2;
      embedding[index3] += Math.sin(charCode * j) * 0.1;
    }
  }
  
  // Add text length and word count features
  embedding[0] += text.length / 1000;
  embedding[1] += words.length / 100;
  
  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
}

// Compute cosine similarity between two embeddings
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimensions');
  }
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    mag1 += embedding1[i] * embedding1[i];
    mag2 += embedding2[i] * embedding2[i];
  }
  
  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  
  if (magnitude === 0) {
    return 0;
  }
  
  return dotProduct / magnitude;
}

// Batch generate embeddings - process 50 products at a time with LLM
export async function batchGenerateEmbeddings(
  products: CatalogProduct[]
): Promise<Map<number, { embedding: number[]; tags: string[] }>> {
  const results = new Map<number, { embedding: number[]; tags: string[] }>();
  const batchSize = 50; // Process 50 products at once
  
  console.log(`\n🧠 Processing ${products.length} products in batches of ${batchSize}`);
  console.log(`📡 Using Juspay Grid AI (no rate limiting!)\n`);
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(products.length / batchSize);
    
    console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} products)...`);
    
    try {
      const batchResults = await batchProcessProductsWithLLM(batch);
      
      // Store results
      for (const result of batchResults) {
        results.set(result.id, {
          embedding: result.embedding,
          tags: result.tags
        });
      }
      
      const progress = Math.min(i + batchSize, products.length);
      const percentage = Math.round((progress / products.length) * 100);
      console.log(`✅ Batch ${batchNum} complete | Total: ${progress}/${products.length} (${percentage}%)\n`);
      
      // Rate limiting: wait 1 second between batches
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error: any) {
      console.error(`❌ Batch ${batchNum} failed:`, error.message);
      console.log(`⚠️  Using fallback for batch ${batchNum}\n`);
      
      // Fallback for failed batch
      for (const product of batch) {
        results.set(product.id, {
          embedding: generateEmbeddingFromText(createProductText(product)),
          tags: extractFallbackTags(product)
        });
      }
    }
  }
  
  console.log(`\n✅ All ${products.length} products processed!\n`);
  return results;
}
