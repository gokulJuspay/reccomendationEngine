// Interface for a single product variant
export interface ProductVariant {
  id: number;
  title: string;
  price: number;
  inventory_quantity: number;
}

// Interface for the input product
export interface Product {
  id: number;
  title: string;
  category: string;
  price: number;
  vendor: string;
  variants: ProductVariant[];
}

// Interface for the incoming request payload
export interface RecommendationRequest {
  shop_id: string;
  product: Product;
  recommendation_type?: Array<'upsell' | 'crosssell'>;
}

// Interface for a product from the S3 catalog
export interface CatalogProduct {
  id: number;
  title: string;
  status: string;
  category: string;
  price: number;
  vendor: string;
  variants: ProductVariant[];
  tags?: string[];
  weight?: number;
  stock?: number;
  merchant_score?: number;
  purchase_score?: number;
  embedding?: number[];
  embedding_version?: string;
}

// Interface for the flattened, filtered product structure used in the prompt
export interface FlattenedProduct {
  id: number;
  title: string;
  variant_id: number;
  variant_title: string;
  category: string;
  price: number;
  vendor: string;
}

// Interface for the expected LLM JSON response
export interface LLMResponse {
  upsell: FlattenedProduct[];
  crosssell: FlattenedProduct[];
}

// Database Product Schema
export interface DBProduct {
  id: number;
  shop_id: string;
  title: string;
  category: string;
  tags: string[];
  weight?: number;
  vendor: string;
  price: number;
  variants: ProductVariant[];
  status: string;
  stock: number;
  merchant_score: number;
  purchase_score: number;
  embedding: number[] | null;
  embedding_version: string | null;
  created_at: Date;
  updated_at: Date;
}

// Tag Graph Node - represents a tag and its related tags
export interface TagGraphNode {
  tag_name: string;
  children: string[]; // Just array of related tag names, no weights
}

// Tag Graph DB Schema
export interface DBTagGraph {
  tag_name: string;
  children: string[]; // Array of related tag names
  updated_at: Date;
}

// Process Tracker
export interface ProcessTracker {
  id?: number;
  shop_id: string;
  status: 'running' | 'completed' | 'failed';
  product_count: number;
  started_at: Date;
  completed_at?: Date;
  last_run: Date;
}

// Precomputation Request
export interface PrecomputeRequest {
  shop_id: string;
  force_rebuild?: boolean;
}

// Recommendation Response
export interface RecommendationResponse {
  shop_id: string;
  product_id: number;
  recommendations: {
    upsell: ScoredProduct[];
    crosssell: ScoredProduct[];
  };
  processing_time_ms: number;
}

// Scored Product for Ranking
export interface ScoredProduct extends FlattenedProduct {
  score: number;
  embedding_similarity: number;
  merchant_score: number;
  purchase_score: number;
  price_similarity: number;
}

// Config
export interface Config {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  embedding: {
    model: string;
    version: string;
    dimensions: number;
  };
  ranking: {
    weights: {
      embedding_similarity: number;
      purchase_score: number;
      merchant_score: number;
      price_similarity: number;
    };
  };
  limits: {
    candidate_pool_size: number;
    similarity_top_k: number;
    final_recommendations: number;
  };
}
