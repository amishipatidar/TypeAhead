/**
 * GET /cache/debug?prefix=<prefix>
 * 
 * Debug endpoint showing consistent hashing behavior.
 * Shows which cache node is responsible for a prefix and whether it's a hit or miss.
 */

const express = require('express');
const router = express.Router();
const distributedCache = require('../distributedCache');
const { normalizeQuery } = require('../prefixUtils');

router.get('/', async (req, res) => {
    try {
        const rawPrefix = req.query.prefix;

        if (!rawPrefix || rawPrefix.trim().length === 0) {
            return res.status(400).json({
                error: 'Missing prefix',
                message: 'Query parameter "prefix" is required'
            });
        }

        const prefix = normalizeQuery(rawPrefix);
        const debugInfo = await distributedCache.debugPrefix(prefix);

        return res.json(debugInfo);

    } catch (error) {
        console.error('❌ Cache debug error:', error.message);
        return res.status(500).json({
            error: 'Failed to get cache debug info',
            message: error.message
        });
    }
});

module.exports = router;
