/**
 * GET /trending
 * 
 * Returns top 10 trending queries.
 * After decay is applied, recently popular queries naturally rank higher.
 * 
 * From class: "Even though 'why is the sky blue?' might have a higher 
 *              overall count, since 'what happened in Nepal?' is trending 
 *              (recent + popular), we should rank that higher"
 */

const express = require('express');
const router = express.Router();
const frequencyStore = require('../frequencyStore');

router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const trending = await frequencyStore.getTopQueries(limit);

        return res.json({
            trending,
            count: trending.length,
            description: 'Queries ranked by decayed count (recency-aware)'
        });

    } catch (error) {
        console.error('❌ Trending error:', error.message);
        return res.status(500).json({
            error: 'Failed to fetch trending queries',
            message: error.message
        });
    }
});

module.exports = router;
