/**
 * Metrics Tracker
 * 
 * Tracks performance metrics for the typeahead system:
 * - Latency: p50, p95, p99 for suggestion API
 * - Cache: hit rate, miss rate, per-node key count
 * - Batch Writer: total searches, total DB writes, write reduction
 * - Decay: number of decay cycles run
 */

class Metrics {
    constructor() {
        this.reset();
    }

    reset() {
        // Latency tracking (for /suggest endpoint)
        this.latencies = [];
        this.maxLatencyHistory = 10000; // Keep last 10K measurements

        // Cache metrics
        this.cacheHits = 0;
        this.cacheMisses = 0;

        // Write metrics
        this.totalSearchesReceived = 0;
        this.totalSampled = 0;           // Searches that passed sampling
        this.totalFrequencyWrites = 0;   // Writes to frequency DB
        this.totalSuggestionUpdates = 0; // Updates to suggestions DB (after batching)
        this.totalPrefixesUpdated = 0;   // Individual prefix entries updated

        // Decay metrics
        this.decayRunCount = 0;
        this.lastDecayAt = null;

        // DB read metrics
        this.totalDbReads = 0;

        this.startedAt = new Date();
    }

    /**
     * Record a latency measurement (in milliseconds)
     */
    recordLatency(ms) {
        this.latencies.push(ms);
        if (this.latencies.length > this.maxLatencyHistory) {
            this.latencies.shift();
        }
    }

    /**
     * Record a cache hit
     */
    recordCacheHit() {
        this.cacheHits++;
    }

    /**
     * Record a cache miss
     */
    recordCacheMiss() {
        this.cacheMisses++;
    }

    /**
     * Record a search submission
     */
    recordSearchReceived() {
        this.totalSearchesReceived++;
    }

    /**
     * Record that a search passed sampling
     */
    recordSampled() {
        this.totalSampled++;
    }

    /**
     * Record a write to the frequency DB
     */
    recordFrequencyWrite() {
        this.totalFrequencyWrites++;
    }

    /**
     * Record a suggestion update (batch triggered)
     */
    recordSuggestionUpdate(prefixCount) {
        this.totalSuggestionUpdates++;
        this.totalPrefixesUpdated += prefixCount;
    }

    /**
     * Record a DB read
     */
    recordDbRead() {
        this.totalDbReads++;
    }

    /**
     * Record a decay cycle
     */
    recordDecayRun() {
        this.decayRunCount++;
        this.lastDecayAt = new Date();
    }

    /**
     * Calculate percentile from sorted latencies
     */
    _percentile(sortedArr, p) {
        if (sortedArr.length === 0) return 0;
        const index = Math.ceil((p / 100) * sortedArr.length) - 1;
        return sortedArr[Math.max(0, index)];
    }

    /**
     * Get full metrics report
     */
    getReport() {
        const sorted = [...this.latencies].sort((a, b) => a - b);

        const cacheTotal = this.cacheHits + this.cacheMisses;
        const hitRate = cacheTotal > 0 ? ((this.cacheHits / cacheTotal) * 100).toFixed(1) : '0.0';

        // Write reduction: how many times fewer DB suggestion updates vs raw searches
        const writeReduction = this.totalSampled > 0
            ? (this.totalSampled / Math.max(1, this.totalSuggestionUpdates)).toFixed(1)
            : '0.0';

        return {
            uptime: `${Math.floor((Date.now() - this.startedAt.getTime()) / 1000)}s`,
            latency: {
                count: sorted.length,
                p50: this._percentile(sorted, 50).toFixed(2) + 'ms',
                p95: this._percentile(sorted, 95).toFixed(2) + 'ms',
                p99: this._percentile(sorted, 99).toFixed(2) + 'ms',
                avg: sorted.length > 0
                    ? (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2) + 'ms'
                    : '0.00ms'
            },
            cache: {
                hits: this.cacheHits,
                misses: this.cacheMisses,
                total: cacheTotal,
                hitRate: hitRate + '%'
            },
            writes: {
                totalSearchesReceived: this.totalSearchesReceived,
                searchesSampled: this.totalSampled,
                frequencyDbWrites: this.totalFrequencyWrites,
                suggestionUpdates: this.totalSuggestionUpdates,
                prefixesUpdated: this.totalPrefixesUpdated,
                writeReductionRatio: writeReduction + 'x'
            },
            reads: {
                totalDbReads: this.totalDbReads
            },
            decay: {
                runsCompleted: this.decayRunCount,
                lastRunAt: this.lastDecayAt ? this.lastDecayAt.toISOString() : 'never'
            }
        };
    }
}

// Singleton
const metrics = new Metrics();
module.exports = metrics;
