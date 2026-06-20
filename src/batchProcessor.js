/**
 * Batch Processor
 * 
 * From class notes:
 * "fn log_search(search_query):
 *     updated_count = frequency_db.inc(search_query)
 *     if updated_count % 1000 == 0:
 *         update_prefixes(search_query)"
 * 
 * Instead of updating the suggestions for every search,
 * we only update when the count crosses a batch_size threshold.
 * 
 * Write reduction:
 * Before batching: 1M freq writes + 10M suggestion writes = 11M writes/sec
 * After batching:  1M freq writes + 10K suggestion writes = 1.01M writes/sec
 */

const frequencyStore = require('./frequencyStore');
const suggestionsStore = require('./suggestionsStore');
const distributedCache = require('./distributedCache');
const sampler = require('./sampler');
const metrics = require('./metrics');
require('dotenv').config();

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 5;

class BatchProcessor {
    constructor() {
        this.batchSize = BATCH_SIZE;
        this.totalProcessed = 0;
        this.totalBatchTriggered = 0;
    }

    /**
     * Process a search query submission
     * 
     * From class pseudocode:
     * fn log_search(search_query):
     *     updated_count = frequency_db.inc(search_query)
     *     if updated_count % batch_size == 0:
     *         update_prefixes(search_query)
     * 
     * @param {string} query - Normalized search query
     * @returns {Promise<{newCount: number, batchTriggered: boolean, sampled: boolean}>}
     */
    async logSearch(query) {
        metrics.recordSearchReceived();

        // Step 1: Apply sampling
        const sampled = sampler.shouldProcess();
        if (!sampled) {
            return {
                newCount: null,
                batchTriggered: false,
                sampled: false
            };
        }

        metrics.recordSampled();
        this.totalProcessed++;

        // Step 2: Increment count in frequency DB
        // "super simple - just call redis.inc(searchQuery)"
        const newCount = await frequencyStore.inc(query);

        // Step 3: Check if batch threshold is crossed
        // "if updated_count % 1000 == 0: update_prefixes(search_query)"
        let batchTriggered = false;

        if (newCount % this.batchSize === 0) {
            batchTriggered = true;
            this.totalBatchTriggered++;

            // Update all prefix entries in suggestions store
            await suggestionsStore.updatePrefixes(query, newCount);

            // Invalidate cache entries for this query's prefixes
            await distributedCache.invalidatePrefixes(query);

            console.log(`📦 Batch triggered for "${query}" (count=${newCount}, batch_size=${this.batchSize})`);
        }

        return {
            newCount,
            batchTriggered,
            sampled: true
        };
    }

    /**
     * Get batch processing statistics
     */
    getStats() {
        const writeReduction = this.totalProcessed > 0
            ? (this.totalProcessed / Math.max(1, this.totalBatchTriggered)).toFixed(1)
            : '0';

        return {
            batchSize: this.batchSize,
            totalProcessed: this.totalProcessed,
            totalBatchTriggered: this.totalBatchTriggered,
            writeReductionRatio: writeReduction + 'x',
            sampler: sampler.getStats()
        };
    }
}

module.exports = new BatchProcessor();
