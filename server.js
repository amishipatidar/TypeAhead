/**
 * Search Typeahead Server
 * 
 * Express server that serves the typeahead API and frontend.
 * 
 * Architecture (from class):
 * - Search Frequency DB (Redis DB 0): query → count
 * - Top Suggestions DB (Redis DB 1): prefix → top-k suggestions
 * - Distributed Cache: Consistent hashing across 3 logical cache nodes
 * - Batch Processor: Update suggestions only when count % batch_size == 0
 * - Sampler: Process only a fraction of searches (configurable)
 * - Decay Job: Periodically multiply all counts by 0.9 (trending)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
const suggestRoute = require('./src/routes/suggest');
const searchRoute = require('./src/routes/search');
const trendingRoute = require('./src/routes/trending');
const cacheDebugRoute = require('./src/routes/cacheDebug');
const statsRoute = require('./src/routes/stats');

// Mount routes
app.use('/suggest', suggestRoute);
app.use('/search', searchRoute);
app.use('/trending', trendingRoute);
app.use('/cache/debug', cacheDebugRoute);
app.use('/stats', statsRoute);

// Health check
app.get('/health', (req, res) => {
    const { useRedis } = require('./src/redis');
    res.json({
        status: 'ok',
        storage: useRedis ? 'redis' : 'in-memory',
        timestamp: new Date().toISOString()
    });
});

// ===========================
// Startup
// ===========================
async function start() {
    const { initializeClients } = require('./src/redis');

    console.log('\n⚡ Search Typeahead System — Starting...\n');

    // Step 1: Initialize Redis or fallback to in-memory
    await initializeClients();

    // Step 2: Auto-load dataset if data store is empty
    const frequencyStore = require('./src/frequencyStore');
    const count = await frequencyStore.getCount();

    if (count === 0) {
        const DATA_PATH = path.join(__dirname, 'data', 'queries.csv');
        if (fs.existsSync(DATA_PATH)) {
            console.log('\n📥 Data store is empty — loading dataset...');
            await loadDataset(DATA_PATH, frequencyStore);
        } else {
            console.log('\n⚠️  No dataset found. Run "npm run generate" first, then restart.');
        }
    } else {
        console.log(`\n📊 Data store has ${count} queries loaded`);
    }

    // Step 3: Start Express server
    app.listen(PORT, () => {
        console.log(`\n🚀 Search Typeahead Server running on http://localhost:${PORT}`);
        console.log(`\n📡 API Endpoints:`);
        console.log(`   GET  /suggest?q=<prefix>         → Typeahead suggestions`);
        console.log(`   POST /search { query: "..." }     → Submit search`);
        console.log(`   GET  /trending                    → Trending searches`);
        console.log(`   GET  /cache/debug?prefix=<prefix> → Cache debug info`);
        console.log(`   GET  /stats                       → Performance metrics`);
        console.log(`   GET  /health                      → Health check`);
        console.log(`\n🌐 Frontend: http://localhost:${PORT}\n`);

        // Step 4: Start the decay job
        const decayJob = require('./src/decayJob');
        decayJob.start();
    });
}

/**
 * Load dataset from CSV into frequency store and build suggestions
 */
async function loadDataset(csvPath, frequencyStore) {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header
    const entries = [];

    for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.match(/^"(.+)",(\d+)$/);
        if (match) {
            entries.push({
                query: match[1].toLowerCase().trim(),
                count: parseInt(match[2])
            });
        }
    }

    console.log(`   Parsed ${entries.length} queries from CSV`);

    // Bulk load into frequency store
    await frequencyStore.bulkSet(entries);
    console.log(`   ✅ Loaded ${entries.length} queries into Frequency Store`);

    // Build initial suggestions
    const suggestionsStore = require('./src/suggestionsStore');
    const result = await suggestionsStore.rebuildAll();
    console.log(`   ✅ Built suggestions for ${result.prefixes} prefixes from top ${result.queries} queries`);
}

start().catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});
