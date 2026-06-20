/**
 * GET /suggest?q=<prefix>
 * 
 * Fetch typeahead suggestions for a given prefix.
 * 
 * Flow:
 * 1. Normalize input (lowercase, trim)
 * 2. Route to cache node via consistent hashing
 * 3. Cache HIT → return
 * 4. Cache MISS → query suggestions store → return
 * 
 * From class: "If someone types 'what i' then we can just go to the 
 *              suggestions db, and look up that partialQuery."
 */

const express = require('express');
const router = express.Router();
const distributedCache = require('../distributedCache');
const { normalizeQuery } = require('../prefixUtils');

router.get('/', async (req, res) => {
    try {
        const rawQuery = req.query.q;

        // Handle empty/missing input
        if (!rawQuery || rawQuery.trim().length === 0) {
            return res.json({
                suggestions: [],
                source: 'none',
                node: null,
                hit: false,
                latencyMs: 0,
                message: 'Empty prefix'
            });
        }

        const prefix = normalizeQuery(rawQuery);

        // Query through distributed cache (handles routing + fallback)
        const result = await distributedCache.getSuggestions(prefix);

        return res.json({
            prefix,
            suggestions: result.suggestions,
            source: result.source,
            node: result.node,
            hit: result.hit,
            latencyMs: result.latencyMs
        });

    } catch (error) {
        console.error('❌ Suggest error:', error.message);
        return res.status(500).json({
            error: 'Failed to fetch suggestions',
            message: error.message
        });
    }
});

module.exports = router;
