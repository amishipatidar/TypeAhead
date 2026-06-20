/**
 * GET /stats
 * 
 * Returns performance metrics:
 * - Latency percentiles (p50, p95, p99)
 * - Cache hit rate
 * - Write reduction ratio (from batching + sampling)
 * - Decay job status
 * - Database read/write counts
 */

const express = require('express');
const router = express.Router();
const metrics = require('../metrics');
const batchProcessor = require('../batchProcessor');
const decayJob = require('../decayJob');
const frequencyStore = require('../frequencyStore');
const suggestionsStore = require('../suggestionsStore');

router.get('/', async (req, res) => {
    try {
        const [queryCount, suggestionCount] = await Promise.all([
            frequencyStore.getCount(),
            suggestionsStore.getCount()
        ]);

        return res.json({
            metrics: metrics.getReport(),
            batchProcessor: batchProcessor.getStats(),
            decay: decayJob.getStatus(),
            dataStore: {
                frequencyStoreKeys: queryCount,
                suggestionsStoreKeys: suggestionCount
            }
        });

    } catch (error) {
        console.error('❌ Stats error:', error.message);
        return res.status(500).json({
            error: 'Failed to get stats',
            message: error.message
        });
    }
});

module.exports = router;
