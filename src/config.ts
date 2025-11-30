import type { Config } from './types/index.js';

export const config: Config = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'recommendation_engine',
    user: process.env.DB_USER || process.env.USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  embedding: {
    model: 'text-embedding-004',
    version: 'v1',
    dimensions: 768,
  },
  ranking: {
    weights: {
      embedding_similarity: 0.45,
      purchase_score: 0.25,
      merchant_score: 0.20,
      price_similarity: 0.10,
    },
  },
  limits: {
    candidate_pool_size: 70,
    similarity_top_k: 20,
    final_recommendations: 10,
  },
};
