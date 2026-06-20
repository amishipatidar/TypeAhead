/**
 * Decay Job (Trending)
 * 
 * From class notes:
 * "After each day, decrease the total count for each query by 10%"
 * 
 * day 1: 1000
 * day 2: 90% of 1000 + new_searches => 1900
 * day 3: 90% of 1900 + new_searches => 2710
 * 
 * "If the count after decay reduces below a threshold (say 0)
 *  then we can remove that entry."
 * 
 * This ensures:
 * - Trending queries (recent + popular) rank higher
 * - Old viral queries naturally decay away
 * - Steady queries converge to count/(1-decay) = stable ceiling
 */

const frequencyStore = require('./frequencyStore');
const suggestionsStore = require('./suggestionsStore');
const distributedCache = require('./distributedCache');
const metrics = require('./metrics');
require('dotenv').config();

const DECAY_FACTOR = parseFloat(process.env.DECAY_FACTOR) || 0.9;
const DECAY_INTERVAL = parseInt(process.env.DECAY_INTERVAL_SECONDS) || 60;
const REMOVAL_THRESHOLD = parseInt(process.env.DECAY_REMOVAL_THRESHOLD) || 1;

class DecayJob {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
        this.lastResult = null;
    }

    /**
     * Run a single decay cycle
     * 
     * 1. Multiply all counts in frequency store by decay factor
     * 2. Remove entries below threshold
     * 3. Rebuild suggestions store
     * 4. Clear distributed cache
     */
    async runDecay() {
        if (this.isRunning) {
            console.log('⏳ Decay job already running, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            console.log(`\n🔥 Running decay job (factor=${DECAY_FACTOR}, threshold=${REMOVAL_THRESHOLD})...`);

            // Step 1: Apply decay to all frequency counts
            const { decayed, removed } = await frequencyStore.applyDecay(
                DECAY_FACTOR,
                REMOVAL_THRESHOLD
            );

            // Step 2: Rebuild suggestions from updated counts
            const rebuildResult = await suggestionsStore.rebuildAll();

            // Step 3: Clear the distributed cache (stale after count changes)
            await distributedCache.clearAll();

            const elapsed = Date.now() - startTime;
            metrics.recordDecayRun();

            this.lastResult = {
                decayed,
                removed,
                prefixesRebuilt: rebuildResult.prefixes,
                queriesProcessed: rebuildResult.queries,
                elapsedMs: elapsed,
                timestamp: new Date().toISOString()
            };

            console.log(`✅ Decay complete: ${decayed} decayed, ${removed} removed, ${rebuildResult.prefixes} prefixes rebuilt (${elapsed}ms)\n`);

        } catch (error) {
            console.error('❌ Decay job error:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Start the periodic decay job
     */
    start() {
        if (this.intervalId) {
            console.log('⚠️ Decay job already started');
            return;
        }

        console.log(`⏰ Decay job scheduled every ${DECAY_INTERVAL}s (factor=${DECAY_FACTOR})`);

        this.intervalId = setInterval(() => {
            this.runDecay();
        }, DECAY_INTERVAL * 1000);
    }

    /**
     * Stop the periodic decay job
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('🛑 Decay job stopped');
        }
    }

    /**
     * Get decay job status
     */
    getStatus() {
        return {
            running: this.isRunning,
            scheduled: this.intervalId !== null,
            decayFactor: DECAY_FACTOR,
            intervalSeconds: DECAY_INTERVAL,
            removalThreshold: REMOVAL_THRESHOLD,
            lastResult: this.lastResult
        };
    }
}

module.exports = new DecayJob();
