/**
 * POST /search
 * 
 * Submit a search query. Returns "Searched" and records the query.
 * 
 * Flow:
 * 1. Apply sampling (if rand() < SAMPLE_RATE)
 * 2. If sampled: freq_db.inc(query)
 * 3. If count % batch_size == 0: update suggestions
 * 4. Return { message: "Searched" }
 * 
 * From class: "Whenever someone searches for a query, I need to update 
 *              the count in the search frequency database"
 */

const express = require('express');
const router = express.Router();
const batchProcessor = require('../batchProcessor');
const { normalizeQuery } = require('../prefixUtils');

router.post('/', async (req, res) => {
    try {
        const rawQuery = req.body.query;

        if (!rawQuery || rawQuery.trim().length === 0) {
            return res.status(400).json({
                error: 'Missing query',
                message: 'Request body must include a "query" field'
            });
        }

        const query = normalizeQuery(rawQuery);

        // Process through batch processor (includes sampling + batching)
        const result = await batchProcessor.logSearch(query);

        return res.json({
            message: 'Searched',
            query,
            sampled: result.sampled,
            newCount: result.newCount,
            batchTriggered: result.batchTriggered
        });

    } catch (error) {
        console.error('❌ Search error:', error.message);
        return res.status(500).json({
            error: 'Failed to process search',
            message: error.message
        });
    }
});

module.exports = router;
