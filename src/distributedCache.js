/**
 * Distributed Cache Layer
 * 
 * Uses consistent hashing to route prefix lookups to cache nodes.
 * Each "cache node" is a Redis key namespace: sugg:node-X:prefix
 * 
 * Flow (from class):
 * 1. User types "iph"
 * 2. hash("iph") → lands on cache-node-2
 * 3. Check Redis key "cache:node-2:iph"
 *    → HIT: return cached suggestions
 *    → MISS: query Suggestions Store → store in cache with TTL → return
 */

const ConsistentHashRing = require('./consistentHash');
const suggestionsStore = require('./suggestionsStore');
const frequencyStore = require('./frequencyStore');
const { getPrefixes } = require('./prefixUtils');
const metrics = require('./metrics');
const { suggestionsClient } = require('./redis');
require('dotenv').config();

const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS) || 300;
const NODE_COUNT = parseInt(process.env.CACHE_NODE_COUNT) || 3;
const VIRTUAL_NODES = parseInt(process.env.VIRTUAL_NODES_PER_NODE) || 150;
const TOP_K = parseInt(process.env.TOP_K) || 10;

class DistributedCache {
    constructor() {
        this.ring = new ConsistentHashRing(VIRTUAL_NODES);
        this.nodeNames = [];

        // Add cache nodes to the ring
        for (let i = 1; i <= NODE_COUNT; i++) {
            const nodeName = `cache-node-${i}`;
            this.ring.addNode(nodeName);
            this.nodeNames.push(nodeName);
        }

        console.log(`🔗 Consistent hash ring initialized with ${NODE_COUNT} nodes, ${VIRTUAL_NODES} virtual nodes each`);
    }

    /**
     * Build the cache key for a prefix on its assigned node
     * @param {string} nodeId 
     * @param {string} prefix 
     * @returns {string}
     */
    _cacheKey(nodeId, prefix) {
        return `cache:${nodeId}:${prefix}`;
    }

    /**
     * Get suggestions for a prefix, using cache-aside pattern
     * 
     * 1. Hash prefix → find responsible cache node
     * 2. Check cache → HIT: return
     * 3. MISS: query suggestions store → store in cache with TTL → return
     * 
     * @param {string} prefix
     * @returns {Promise<{suggestions: Array, source: string, node: string, hit: boolean}>}
     */
    async getSuggestions(prefix) {
        const startTime = Date.now();

        // Step 1: Route to cache node via consistent hashing
        const { nodeId, hash } = this.ring.getNode(prefix);
        const cacheKey = this._cacheKey(nodeId, prefix);

        // Step 2: Check cache
        const cached = await suggestionsClient.get(cacheKey);

        if (cached) {
            // CACHE HIT
            metrics.recordCacheHit();
            const latency = Date.now() - startTime;
            metrics.recordLatency(latency);

            return {
                suggestions: JSON.parse(cached),
                source: 'cache',
                node: nodeId,
                hit: true,
                hash,
                latencyMs: latency
            };
        }

        // Step 3: CACHE MISS — query suggestions store
        metrics.recordCacheMiss();

        let suggestions = await suggestionsStore.getSuggestions(prefix);

        if (!suggestions || suggestions.length === 0) {
            // Not in suggestions store either — fall back to frequency store scan
            suggestions = await frequencyStore.getByPrefix(prefix, TOP_K);
        }

        // Store in cache with TTL
        if (suggestions && suggestions.length > 0) {
            await suggestionsClient.setex(cacheKey, CACHE_TTL, JSON.stringify(suggestions));
        }

        const latency = Date.now() - startTime;
        metrics.recordLatency(latency);

        return {
            suggestions: suggestions || [],
            source: 'db',
            node: nodeId,
            hit: false,
            hash,
            latencyMs: latency
        };
    }

    /**
     * Invalidate cache entries for all prefixes of a query
     * Called when a query's count is updated
     * 
     * @param {string} query
     */
    async invalidatePrefixes(query) {
        const prefixes = getPrefixes(query);
        const pipeline = suggestionsClient.pipeline();

        for (const prefix of prefixes) {
            const { nodeId } = this.ring.getNode(prefix);
            const cacheKey = this._cacheKey(nodeId, prefix);
            pipeline.del(cacheKey);
        }

        await pipeline.exec();
    }

    /**
     * Clear all cache entries across all nodes
     */
    async clearAll() {
        let cursor = '0';
        do {
            const [newCursor, keys] = await suggestionsClient.scan(
                cursor, 'MATCH', 'cache:*', 'COUNT', 1000
            );
            cursor = newCursor;
            if (keys.length > 0) {
                await suggestionsClient.del(...keys);
            }
        } while (cursor !== '0');
    }

    /**
     * Debug: Get information about cache routing for a prefix
     * Used by GET /cache/debug?prefix=<prefix>
     * 
     * @param {string} prefix
     * @returns {Promise<object>}
     */
    async debugPrefix(prefix) {
        const { nodeId, hash, ringPosition } = this.ring.getNode(prefix);
        const cacheKey = this._cacheKey(nodeId, prefix);

        const cached = await suggestionsClient.get(cacheKey);
        const ttl = await suggestionsClient.ttl(cacheKey);

        // Get per-node key counts
        const nodeKeyCounts = {};
        for (const nodeName of this.nodeNames) {
            let count = 0;
            let cursor = '0';
            do {
                const [newCursor, keys] = await suggestionsClient.scan(
                    cursor, 'MATCH', `cache:${nodeName}:*`, 'COUNT', 1000
                );
                cursor = newCursor;
                count += keys.length;
            } while (cursor !== '0');
            nodeKeyCounts[nodeName] = count;
        }

        return {
            prefix,
            hashValue: hash,
            ringPosition,
            assignedNode: nodeId,
            cacheKey,
            hit: cached !== null,
            ttlSeconds: ttl > 0 ? ttl : null,
            cachedData: cached ? JSON.parse(cached) : null,
            nodeDistribution: nodeKeyCounts,
            ringState: this.ring.getRingState()
        };
    }
}

module.exports = new DistributedCache();
