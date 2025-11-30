#!/bin/bash

echo "🧪 Testing Recommendation Engine API"
echo "======================================"

BASE_URL="http://localhost:3000"

# Test 1: Health check
echo -e "\n1️⃣ Testing health endpoint..."
curl -s "${BASE_URL}/health" | jq '.'

# Test 2: Start precomputation (will fail if no products, but tests endpoint)
echo -e "\n2️⃣ Testing precomputation endpoint..."
curl -s -X POST "${BASE_URL}/api/precompute" \
  -H "Content-Type: application/json" \
  -d '{"shop_id": "test-shop", "force_rebuild": true}' | jq '.'

# Test 3: Get recommendations with product IDs
echo -e "\n3️⃣ Testing recommendations endpoint..."
curl -s -X POST "${BASE_URL}/api/recommendations" \
  -H "Content-Type: application/json" \
  -d '{
    "shop_id": "test-shop",
    "product_ids": [1, 2, 3],
    "recommendation_type": ["upsell", "crosssell"]
  }' | jq '.'

echo -e "\n✅ All API tests completed!"
