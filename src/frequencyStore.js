/**
 * Frequency Store (Redis DB 0)
 * 
 * Maps: query → count
 * This is the "Search Frequency Database" from class notes.
 * 
 * Key operations:
 * - inc(query): Increment count (like redis.incr)
 * - get(query): Get current count
 * - getTop(n): Get top N queries by count
 * - applyDecay(factor): Multiply all counts by factor (for trending)
 * - bulkSet(entries): Load dataset
 * 
 * Redis key pattern: "freq:<query>" (prefix set on client)
 */

const redisModule = require('./redis');
const metrics = require('./metrics');

class FrequencyStore {
    get _freq() { return redisModule.frequencyClient; }
    get _raw() { return redisModule.frequencyRawClient; }

    /**
     * Increment the count for a query
     * Returns the new count after increment
     * 
     * From class: "super simple - just call redis.inc(searchQuery)"
     * 
     * @param {string} query - Normalized query string
     * @param {number} amount - Amount to increment (default 1)
     * @returns {Promise<number>} - New count
     */
    async inc(query, amount = 1) {
        metrics.recordFrequencyWrite();
        const newCount = await this._freq.incrby(query, amount);
        // Also update the last_searched timestamp
        await this._raw.set(`meta:${query}:last_searched`, Date.now());
        return newCount;
    }

    /**
     * Get the current count for a query
     * @param {string} query
     * @returns {Promise<number>}
     */
    async get(query) {
        const count = await this._freq.get(query);
        return count ? parseInt(count) : 0;
    }

    /**
     * Get the last searched timestamp for a query
     * @param {string} query
     * @returns {Promise<number|null>}
     */
    async getLastSearched(query) {
        const ts = await this._raw.get(`meta:${query}:last_searched`);
        return ts ? parseInt(ts) : null;
    }

    /**
     * Set a query's count directly (used during dataset loading)
     * @param {string} query
     * @param {number} count
     */
    async set(query, count) {
        await this._freq.set(query, count);
    }

    /**
     * Bulk load entries from dataset
     * Uses Redis pipeline for efficiency
     * @param {Array<{query: string, count: number}>} entries
     */
    async bulkSet(entries) {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
            const batch = entries.slice(i, i + BATCH_SIZE);
            const pipeline = this._freq.pipeline();
            for (const { query, count } of batch) {
                pipeline.set(query, count);
            }
            await pipeline.exec();

            // Progress log every 10K
            if ((i + BATCH_SIZE) % 10000 === 0 || i + BATCH_SIZE >= entries.length) {
                console.log(`   ... loaded ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length}`);
            }
        }
    }

    /**
     * Get all queries matching a prefix, sorted by count descending
     * This is the fallback when cache misses — scans the frequency DB
     * 
     * @param {string} prefix - The prefix to match
     * @param {number} limit - Max results (default 10)
     * @returns {Promise<Array<{query: string, count: number}>>}
     */
    async getByPrefix(prefix, limit = 10) {
        metrics.recordDbRead();
        
        const results = [];
        let cursor = '0';

        do {
            const [newCursor, keys] = await this._raw.scan(
                cursor, 'MATCH', `freq:${prefix}*`, 'COUNT', 2000
            );
            cursor = newCursor;

            if (keys.length > 0) {
                // Filter out meta keys
                const freqKeys = keys.filter(k => k.startsWith('freq:') && !k.includes(':last_searched'));
                if (freqKeys.length === 0) continue;

                const pipeline = this._raw.pipeline();
                for (const key of freqKeys) {
                    pipeline.get(key);
                }
                const values = await pipeline.exec();

                for (let i = 0; i < freqKeys.length; i++) {
                    const query = freqKeys[i].substring(5); // Remove 'freq:' prefix
                    const count = parseInt(values[i][1]) || 0;
                    if (count > 0) {
                        results.push({ query, count });
                    }
                }
            }
        } while (cursor !== '0');

        // Sort by count descending and return top N
        results.sort((a, b) => b.count - a.count);
        return results.slice(0, limit);
    }

    /**
     * Get top N queries overall (for trending endpoint)
     * @param {number} limit
     * @returns {Promise<Array<{query: string, count: number}>>}
     */
    async getTopQueries(limit = 10) {
        metrics.recordDbRead();

        const results = [];
        let cursor = '0';

        do {
            const [newCursor, keys] = await this._raw.scan(
                cursor, 'MATCH', 'freq:*', 'COUNT', 2000
            );
            cursor = newCursor;

            if (keys.length > 0) {
                // Filter to only freq: keys (not meta: keys)
                const freqKeys = keys.filter(k => k.startsWith('freq:') && !k.includes(':last_searched'));
                if (freqKeys.length === 0) continue;

                const pipeline = this._raw.pipeline();
                for (const key of freqKeys) {
                    pipeline.get(key);
                }
                const values = await pipeline.exec();

                for (let i = 0; i < freqKeys.length; i++) {
                    const query = freqKeys[i].substring(5); // Remove 'freq:'
                    const count = parseInt(values[i][1]) || 0;
                    if (count > 0) {
                        results.push({ query, count });
                    }
                }
            }
        } while (cursor !== '0');

        results.sort((a, b) => b.count - a.count);
        return results.slice(0, limit);
    }

    /**
     * Apply decay to all counts (for trending)
     * Multiplies every count by the decay factor.
     * Removes entries below the threshold.
     * 
     * From class: "After each day, decrease the total count for each query by 10%"
     * 
     * @param {number} factor - Decay factor (e.g., 0.9)
     * @param {number} threshold - Remove entries below this count
     * @returns {Promise<{decayed: number, removed: number}>}
     */
    async applyDecay(factor, threshold = 1) {
        let decayed = 0;
        let removed = 0;
        let cursor = '0';

        do {
            const [newCursor, keys] = await this._raw.scan(
                cursor, 'MATCH', 'freq:*', 'COUNT', 2000
            );
            cursor = newCursor;

            if (keys.length > 0) {
                const freqKeys = keys.filter(k => k.startsWith('freq:') && !k.includes(':last_searched'));
                if (freqKeys.length === 0) continue;

                const pipeline = this._raw.pipeline();
                for (const key of freqKeys) {
                    pipeline.get(key);
                }
                const values = await pipeline.exec();

                const updatePipeline = this._raw.pipeline();
                for (let i = 0; i < freqKeys.length; i++) {
                    const count = parseInt(values[i][1]) || 0;
                    const newCount = Math.floor(count * factor);

                    if (newCount < threshold) {
                        updatePipeline.del(freqKeys[i]);
                        const query = freqKeys[i].substring(5);
                        updatePipeline.del(`meta:${query}:last_searched`);
                        removed++;
                    } else {
                        updatePipeline.set(freqKeys[i], newCount);
                        decayed++;
                    }
                }
                await updatePipeline.exec();
            }
        } while (cursor !== '0');

        return { decayed, removed };
    }

    /**
     * Get total number of queries stored
     * @returns {Promise<number>}
     */
    async getCount() {
        let count = 0;
        let cursor = '0';
        do {
            const [newCursor, keys] = await this._raw.scan(
                cursor, 'MATCH', 'freq:*', 'COUNT', 2000
            );
            cursor = newCursor;
            // Only count actual freq keys, not meta keys
            count += keys.filter(k => k.startsWith('freq:') && !k.includes(':last_searched')).length;
        } while (cursor !== '0');
        return count;
    }

    /**
     * Flush the entire frequency store
     */
    async flush() {
        await this._raw.flushdb();
    }
}

module.exports = new FrequencyStore();
