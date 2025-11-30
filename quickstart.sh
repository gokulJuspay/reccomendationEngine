#!/bin/bash

# Quick Start Script for Recommendation Engine

echo "🚀 Starting Recommendation Engine Quick Start..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please edit it with your configuration."
    echo ""
fi

# Check if PostgreSQL is running
echo "🔍 Checking PostgreSQL connection..."
if ! psql -U postgres -c '\q' 2>/dev/null; then
    echo "❌ PostgreSQL is not running or not accessible."
    echo "Please start PostgreSQL first:"
    echo "  - Mac: brew services start postgresql"
    echo "  - Docker: docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14"
    exit 1
fi

echo "✅ PostgreSQL is running"
echo ""

# Create database if it doesn't exist
echo "📊 Setting up database..."
psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'recommendation_engine'" | grep -q 1 || \
    psql -U postgres -c "CREATE DATABASE recommendation_engine;"

echo "✅ Database ready"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install
echo ""

# Build the project
echo "🔨 Building project..."
pnpm build
echo ""

# Start the server
echo "🚀 Starting server..."
echo "Server will be available at http://localhost:3000"
echo ""
echo "📡 API Endpoints:"
echo "  - POST /api/precompute - Precompute products"
echo "  - POST /api/recommendations - Get recommendations"
echo ""

pnpm dev
