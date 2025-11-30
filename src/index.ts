import express, {type Request, type Response} from 'express';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './database/db.js';
import { runPrecomputation } from './services/precompute-service.js';
import { getRecommendations } from './services/recommendation-service.js';
import type { PrecomputeRequest } from './types/index.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Precompute endpoint - triggers the daily/hourly precomputation
app.post('/api/precompute', async (req: Request, res: Response) => {
    try {
        const { shop_id, force_rebuild = false }: PrecomputeRequest = req.body;
        
        if (!shop_id) {
            res.status(400).json({ error: 'shop_id is required' });
            return;
        }
        
        console.log(`🚀 Starting precomputation for shop: ${shop_id}`);
        const startTime = Date.now();
        
        // Run precomputation in the background
        runPrecomputation(shop_id, force_rebuild).catch(err => {
            console.error('Precomputation error:', err);
        });
        
        // Return immediately
        res.json({
            message: 'Precomputation started',
            shop_id,
            started_at: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Error in precompute endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get recommendations endpoint - returns product recommendations
app.post('/api/recommendations', async (req: Request, res: Response) => {
    try {
        const { shop_id, product_ids, recommendation_type } = req.body;
        
        if (!shop_id || !product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
            res.status(400).json({ error: 'shop_id and product_ids (array of numbers) are required' });
            return;
        }
        
        console.log(`🎯 Generating recommendations for products: ${product_ids.join(', ')}`);
        const startTime = Date.now();
        
        // Get recommendations using new signature
        const recommendations = await getRecommendations(
            shop_id,
            product_ids,
            recommendation_type || ['upsell', 'crosssell']
        );
        
        const processingTime = Date.now() - startTime;
        
        const response = {
            shop_id,
            product_ids,
            recommendations,
            processing_time_ms: processingTime
        };
        
        console.log(`✅ Generated ${recommendations.upsell.length} upsell and ${recommendations.crosssell.length} crosssell recommendations in ${processingTime}ms`);
        
        res.json(response);
    } catch (error: any) {
        console.error('Error in recommendations endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

// Initialize database and start server
async function startServer() {
    try {
        await initializeDatabase();
        
        app.listen(port, () => {
            console.log(`✅ Server is running at http://localhost:${port}`);
            console.log(`📊 Precompute endpoint: POST http://localhost:${port}/api/precompute`);
            console.log(`🎯 Recommendations endpoint: POST http://localhost:${port}/api/recommendations`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    console.log(`⚠️  ${signal} received again, forcing exit...`);
    process.exit(1);
  }
  isShuttingDown = true;
  console.log(`\n${signal} received, shutting down gracefully...`);
  try {
    await closeDatabase();
    console.log('👋 Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));startServer();