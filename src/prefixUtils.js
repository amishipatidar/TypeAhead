/**
 * Prefix Utilities
 * 
 * Extracts all prefixes from a search query.
 * 
 * From class notes:
 * For "what does the fox say", the affected prefixes are:
 * "w", "wh", "wha", "what", "what ", "what d", ... "what does the fox say"
 */

const MIN_PREFIX_LENGTH = parseInt(process.env.MIN_PREFIX_LENGTH) || 1;

/**
 * Extract all prefixes from a query string
 * @param {string} query - The full search query
 * @param {number} minLength - Minimum prefix length (default from env)
 * @returns {string[]} - Array of all prefixes
 * 
 * Example:
 *   getPrefixes("what does") => ["w", "wh", "wha", "what", "what ", "what d", "what do", "what doe", "what does"]
 */
function getPrefixes(query, minLength = MIN_PREFIX_LENGTH) {
    const normalized = query.toLowerCase().trim();
    const prefixes = [];

    for (let i = minLength; i <= normalized.length; i++) {
        prefixes.push(normalized.substring(0, i));
    }

    return prefixes;
}

/**
 * Normalize a query string for consistent storage and lookup
 * @param {string} query
 * @returns {string}
 */
function normalizeQuery(query) {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

module.exports = { getPrefixes, normalizeQuery };
