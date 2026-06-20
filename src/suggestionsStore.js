/**
 * Suggestions Store (Redis DB 1)
 * 
 * Maps: prefix → top-k suggestions (JSON array)
 * This is the "Top Suggestions Database" from class notes.
 * 
 * From class:
 * "As a HLD person, we will realize that effectively, we're just caching 
 *  the top-k results for each possible prefix."
 * 
 * Key pattern: "sugg:<prefix>" → JSON array of {query, count}
 */

const redisModule = require('./redis');
const frequencyStore = require('./frequencyStore');
const { getPrefixes } = require('./prefixUtils');
const metrics = require('./metrics');
require('dotenv').config();

const TOP_K = parseInt(process.env.TOP_K) || 10;

class SuggestionsStore {
    get _sugg() { return redisModule.suggestionsClient; }

    /**
     * Get precomputed suggestions for a prefix
     * @param {string} prefix
     * @returns {Promise<Array<{query: string, count: number}> | null>}
     */
    async getSuggestions(prefix) {
        const data = await this._sugg.get(`sugg:${prefix}`);
        if (data) {
            return JSON.parse(data);
        }
        return null;
    }

    /**
     * Store suggestions for a prefix
     * @param {string} prefix
     * @param {Array<{query: string, count: number}>} suggestions
     */
    async setSuggestions(prefix, suggestions) {
        await this._sugg.set(
            `sugg:${prefix}`,
            JSON.stringify(suggestions)
        );
    }

    /**
     * Update all prefix entries affected by a query count change
     * 
     * From class:
     * "What prefixes will get affected? Only the prefixes of the search query"
     * "The average query is 10 letters. So ~10 prefixes on average need to be updated."
     * 
     * @param {string} query - The query whose count changed
     * @param {number} newCount - The new count value
     */
    async updatePrefixes(query, newCount) {
        const prefixes = getPrefixes(query);
        let updatedCount = 0;

        for (const prefix of prefixes) {
            // Get current suggestions for this prefix
            let suggestions = await this.getSuggestions(prefix);

            if (!suggestions) {
                // No existing suggestions — fetch from frequency store
                suggestions = await frequencyStore.getByPrefix(prefix, TOP_K);
            } else {
                // Check if this query is already in the suggestions
                const existingIdx = suggestions.findIndex(s => s.query === query);
                
                if (existingIdx >= 0) {
                    // Update existing entry's count
                    suggestions[existingIdx].count = newCount;
                } else {
                    // Add new entry
                    suggestions.push({ query, count: newCount });
                }

                // Re-sort by count descending and keep only top K
                suggestions.sort((a, b) => b.count - a.count);
                suggestions = suggestions.slice(0, TOP_K);
            }

            await this.setSuggestions(prefix, suggestions);
            updatedCount++;
        }

        metrics.recordSuggestionUpdate(updatedCount);
        return updatedCount;
    }

    /**
     * Rebuild all suggestion entries from scratch
     * Used after a decay cycle to ensure suggestions reflect new counts
     * 
     * This is expensive but necessary after decay changes counts globally.
     * In production, you would do this incrementally.
     */
    async rebuildAll() {
        console.log('🔄 Rebuilding all suggestions from frequency store...');

        // Clear all suggestion entries
        let cursor = '0';
        do {
            const [newCursor, keys] = await this._sugg.scan(
                cursor, 'MATCH', 'sugg:*', 'COUNT', 1000
            );
            cursor = newCursor;
            if (keys.length > 0) {
                await this._sugg.del(...keys);
            }
        } while (cursor !== '0');

        // Get all queries from frequency store
        const topQueries = await frequencyStore.getTopQueries(1000);

        // For each query, update all its prefix entries
        const prefixMap = new Map(); // prefix → [{query, count}]
        
        for (const { query, count } of topQueries) {
            const prefixes = getPrefixes(query);
            for (const prefix of prefixes) {
                if (!prefixMap.has(prefix)) {
                    prefixMap.set(prefix, []);
                }
                prefixMap.get(prefix).push({ query, count });
            }
        }

        // Write all prefix entries
        const pipeline = this._sugg.pipeline();
        for (const [prefix, entries] of prefixMap) {
            entries.sort((a, b) => b.count - a.count);
            const topEntries = entries.slice(0, TOP_K);
            pipeline.set(`sugg:${prefix}`, JSON.stringify(topEntries));
        }
        await pipeline.exec();

        console.log(`✅ Rebuilt suggestions for ${prefixMap.size} prefixes from ${topQueries.length} queries`);
        return { prefixes: prefixMap.size, queries: topQueries.length };
    }

    /**
     * Delete suggestion entries for all prefixes of a query
     * Used for cache invalidation
     * @param {string} query
     */
    async invalidatePrefixes(query) {
        const prefixes = getPrefixes(query);
        const pipeline = this._sugg.pipeline();
        for (const prefix of prefixes) {
            pipeline.del(`sugg:${prefix}`);
        }
        await pipeline.exec();
    }

    /**
     * Get count of stored suggestion entries
     */
    async getCount() {
        let count = 0;
        let cursor = '0';
        do {
            const [newCursor, keys] = await this._sugg.scan(
                cursor, 'MATCH', 'sugg:*', 'COUNT', 1000
            );
            cursor = newCursor;
            count += keys.length;
        } while (cursor !== '0');
        return count;
    }

    /**
     * Flush all suggestions
     */
    async flush() {
        await this._sugg.flushdb();
    }
}

module.exports = new SuggestionsStore();
