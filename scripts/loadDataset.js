/**
 * Dataset Loader
 * 
 * Reads the generated CSV and bulk-loads queries into Redis.
 * Also builds the initial suggestions store for popular prefixes.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Need to initialize Redis connections
const redisModule = require('../src/redis');
const frequencyStore = require('../src/frequencyStore');
const suggestionsStore = require('../src/suggestionsStore');

const DATA_PATH = path.join(__dirname, '..', 'data', 'queries.csv');

async function loadDataset() {
    console.log('🔄 Loading dataset into Redis...');
    await redisModule.initializeClients();

    const { frequencyRawClient, suggestionsClient } = redisModule;

    // Check if file exists
    if (!fs.existsSync(DATA_PATH)) {
        console.error('❌ Dataset not found. Run "npm run generate" first.');
        process.exit(1);
    }

    // Read CSV
    const content = fs.readFileSync(DATA_PATH, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header
    const entries = [];

    for (const line of lines) {
        if (!line.trim()) continue;

        // Parse CSV with quoted fields
        const match = line.match(/^"(.+)",(\d+)$/);
        if (match) {
            entries.push({
                query: match[1].toLowerCase().trim(),
                count: parseInt(match[2])
            });
        }
    }

    console.log(`📊 Parsed ${entries.length} queries from CSV`);

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await frequencyRawClient.flushdb();
    await suggestionsClient.flushdb();

    // Bulk load into frequency store
    console.log('📥 Loading into Frequency Store (DB 0)...');
    await frequencyStore.bulkSet(entries);
    console.log(`✅ Loaded ${entries.length} queries into Frequency Store`);

    // Build initial suggestions store from top queries
    console.log('📥 Building initial Suggestions Store (DB 1)...');
    const result = await suggestionsStore.rebuildAll();
    console.log(`✅ Built suggestions for ${result.prefixes} prefixes from top ${result.queries} queries`);

    // Print stats
    const freqCount = await frequencyStore.getCount();
    const suggCount = await suggestionsStore.getCount();
    console.log(`\n📊 Final Stats:`);
    console.log(`   Frequency Store: ${freqCount} keys`);
    console.log(`   Suggestions Store: ${suggCount} keys`);
    console.log(`\n✅ Dataset loading complete!`);

    // Disconnect
    redisModule.frequencyClient.disconnect();
    redisModule.suggestionsClient.disconnect();
    redisModule.frequencyRawClient.disconnect();
    process.exit(0);
}

loadDataset().catch(err => {
    console.error('❌ Loading failed:', err);
    process.exit(1);
});
