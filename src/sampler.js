/**
 * Sampler
 * 
 * From class notes:
 * "fn search(query):
 *     ...
 *     if rand() < 0.001:
 *         // with a probability of 0.1% make the following call
 *         make an API call to typeahead service's log_search endpoint"
 * 
 * Only a fraction of searches are processed for count updates.
 * This massively reduces write pressure.
 * 
 * "Sampling causes data loss of individual data points. 
 *  But it won't lose the overall trends."
 */

require('dotenv').config();

const SAMPLE_RATE = parseFloat(process.env.SAMPLE_RATE) || 1.0;

class Sampler {
    constructor() {
        this.rate = SAMPLE_RATE;
        this.totalReceived = 0;
        this.totalPassed = 0;
    }

    /**
     * Decide whether to process this search request
     * @returns {boolean} true if this request should be processed
     */
    shouldProcess() {
        this.totalReceived++;
        if (Math.random() < this.rate) {
            this.totalPassed++;
            return true;
        }
        return false;
    }

    /**
     * Get sampling statistics
     */
    getStats() {
        return {
            sampleRate: this.rate,
            totalReceived: this.totalReceived,
            totalPassed: this.totalPassed,
            actualPassRate: this.totalReceived > 0
                ? (this.totalPassed / this.totalReceived * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Update the sample rate dynamically
     * @param {number} newRate - New rate (0.0 to 1.0)
     */
    setRate(newRate) {
        this.rate = Math.max(0, Math.min(1, newRate));
    }
}

module.exports = new Sampler();
