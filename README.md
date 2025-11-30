# 🛍️ Recommendation Engine

A fast, efficient recommendation system for e-commerce using embeddings, precomputed graphs, and smart scoring without Redis.

## 🎯 Features

- **< 2s Response Time**: Typical queries complete in 300-800ms
- **No Redis Required**: Uses PostgreSQL for all storage
- **Smart Recommendations**: Combines embeddings, purchase behavior, and merchant signals
- **Tag-Based Graph**: Efficient product relationship mapping
- **Dual Recommendation Types**: Both upsell and cross-sell suggestions

## 🏗️ Architecture

### AI Provider Options
- **Google Gemini API**: Direct API access (gemini-2.5-flash-lite)
- **Juspay Grid AI**: Internal Juspay service (gemini-2.5-flash)
- **Neurolink SDK**: Multi-provider support with Google Vertex AI

### Precomputation Phase (Daily/Hourly)
1. Load product catalog from JSON/S3
2. Extract single primary tag per product using LLM
3. Generate embeddings using configured AI provider
4. Compute product scores (merchant + purchase signals)
5. Build tag relationship graph using LLM (all tags in one call)

### Runtime Phase (<2s)
1. Extract product tags from request
2. Query tag graph for related products
3. Fetch top ~100 candidates by score
4. Use LLM to intelligently rank candidates
5. Return top recommendations with timing metrics

## 📊 Database Schema

### Products Table
```sql
- id, shop_id, title, category, tags (TEXT - single tag)
- price, vendor, variants (JSONB)
- merchant_score, purchase_score
- embedding (FLOAT[]), stock, status
```

### Tag Graph Table
```sql
- tag_name (PRIMARY KEY)
- children (TEXT[]) - array of related tag names
```

### Process Tracker
```sql
- shop_id, status, product_count
- started_at, completed_at
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- One of the following AI providers:
  - **Google Gemini API Key** (Direct API - Easiest)
  - **Juspay Grid AI Key** (Internal Juspay use)
  - **Google Vertex AI** (Enterprise - via Neurolink)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
```

### Environment Configuration

Choose **ONE** of the following options:

#### Option 1: Google Gemini API (Recommended - Simplest)
```bash
# Get your key from: https://aistudio.google.com/app/apikey
RECOMMENDATIONS_API_KEY=your_gemini_api_key_here
USE_NEUROLINK=false
```

#### Option 2: Juspay Grid AI (Internal Use)
```bash
GRID_AI_API_KEY=your_grid_ai_key_here
USE_NEUROLINK=false
```

#### Option 3: Google Vertex AI via Neurolink (Advanced)
```bash
USE_NEUROLINK=true
GOOGLE_VERTEX_PROJECT=your-gcp-project-id
GOOGLE_VERTEX_LOCATION=us-central1
VERTEX_MODEL_ID=gemini-2.5-flash-lite
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**Priority Order (when USE_NEUROLINK=false):**
1. `RECOMMENDATIONS_API_KEY` → Uses Gemini API directly
2. `GRID_AI_API_KEY` → Falls back to Grid AI
3. Error if neither is set

### Database Setup

```bash
# Start PostgreSQL (if using Docker)
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14

# Create database
psql -U postgres -c "CREATE DATABASE recommendation_engine;"
```

### Running the Server

```bash
# Development mode
pnpm dev

# Production build
pnpm build
pnpm start
```

## 📡 API Endpoints

### 1. Precompute Products

**POST** `/api/precompute`

Triggers the precomputation pipeline for a shop.

```bash
curl -X POST http://localhost:3000/api/precompute \
  -H "Content-Type: application/json" \
  -d '{
    "shop_id": "shop_123",
    "force_rebuild": false
  }'
```

**Response:**
```json
{
  "message": "Precomputation started",
  "shop_id": "shop_123",
  "started_at": "2025-11-29T10:00:00Z"
}
```

### 2. Get Recommendations

**POST** `/api/recommendations`

Returns product recommendations for a given product.

```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{
    "shop_id": "shop_123",
    "product": {
      "id": 1001,
      "title": "Classic Cotton T-Shirt - White",
      "category": "t-shirts",
      "price": 29.99,
      "vendor": "BasicWear Co.",
      "variants": [...]
    },
    "recommendation_type": ["upsell", "crosssell"]
  }'
```

**Response:**
```json
{
  "shop_id": "shop_123",
  "product_id": 1001,
  "recommendations": {
    "upsell": [
      {
        "id": 1003,
        "title": "V-Neck Premium T-Shirt - Navy",
        "variant_id": 10031,
        "variant_title": "Small",
        "category": "t-shirts",
        "price": 39.99,
        "vendor": "PremiumFit",
        "score": 0.87,
        "embedding_similarity": 0.92,
        "merchant_score": 0.85,
        "purchase_score": 0.78,
        "price_similarity": 0.75
      }
    ],
    "crosssell": [
      {
        "id": 2001,
        "title": "Slim Fit Denim Jeans - Blue",
        "variant_id": 20013,
        "variant_title": "32x32",
        "category": "pants",
        "price": 79.99,
        "vendor": "DenimDreams",
        "score": 0.82,
        ...
      }
    ]
  },
  "processing_time_ms": 347
}
```

## 🧮 Ranking Formula

**LLM-Powered Intelligent Ranking:**
- Uses Gemini 2.5 Flash Lite for intelligent product selection
- Analyzes semantic similarity, complementary fit, price appropriateness
- Returns numeric product IDs for upsell and cross-sell categories
- Fallback to merchant score ranking if LLM fails

**Fallback Scoring:**
```
final_score = 
    merchant_score (stock availability) +
    purchase_score (simulated purchase frequency)
```

Model configuration in `src/services/recommendation-service.ts`.

## 📁 Project Structure

```
src/
├── index.ts                 # Main server & API endpoints
├── config.ts                # Configuration settings
├── types/
│   └── index.ts            # TypeScript interfaces
├── database/
│   └── db.ts               # PostgreSQL connection & schema
├── services/
│   ├── tag-service.ts      # Tag normalization & graph
│   ├── embedding-service.ts # Embedding generation
│   ├── precompute-service.ts # Precomputation pipeline
│   └── recommendation-service.ts # Recommendation engine
└── data/
    └── products.json       # Sample product catalog (750 products)
```

## 🎯 Performance Targets

| Step | Target Time | Notes |
|------|------------|-------|
| STEP 1: Load products from DB | 5-20ms | PostgreSQL query |
| STEP 2: Tag graph lookup | 10-50ms | Related tags fetch |
| STEP 3: Candidate fetch | 50-200ms | Top 100 by score |
| STEP 4: LLM ranking | 500-2000ms | Intelligent selection |
| **Total** | **600-2300ms** | Typical: 800-1200ms |

**Precomputation Timing (4 products example):**
- STEP 1: Load catalog (~5ms)
- STEP 2: LLM embeddings + tags (~2000ms)
- STEP 3: Database save (~100ms)
- STEP 4: Compute scores (~50ms)
- STEP 5: Collect unique tags (~10ms)
- STEP 6: Build tag graph with LLM (~5000ms)
  - LLM processing: ~4500ms
  - Database save: ~500ms
- **Total: ~7-8 seconds**

## 🔧 Configuration

Edit `src/config.ts` to adjust:
- Ranking formula weights
- Candidate pool size (default: 70)
- Final recommendation count (default: 10)
- Embedding model settings

## 🧪 Testing

```bash
# Run precomputation with sample data
curl -X POST http://localhost:3000/api/precompute \
  -H "Content-Type: application/json" \
  -d '{"shop_id": "test_shop"}'

# Get recommendations for a product
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d @test-request.json
```

## 🚀 Future Enhancements

- [ ] User-based personalization
- [ ] Collaborative filtering
- [ ] Real-time clickstream training
- [ ] Seasonal & trending scoring
- [ ] Vector DB upgrade (Pinecone/Qdrant) for >1M products
- [ ] A/B testing framework
- [ ] Multi-region Vertex AI support
- [ ] Caching layer for frequently requested products

## 🔧 Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Database**: PostgreSQL 14+ (JSONB, arrays)
- **AI Providers**: 
  - Google Gemini API (gemini-2.5-flash-lite)
  - Juspay Grid AI (internal)
  - Neurolink SDK with Vertex AI
- **Package Manager**: pnpm
- **API Framework**: Express.js

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.
