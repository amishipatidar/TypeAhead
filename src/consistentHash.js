/**
 * Consistent Hashing Ring
 * 
 * Implements a consistent hash ring with virtual nodes for even distribution.
 * Uses SHA-256 for hashing. Binary search for efficient node lookup.
 * 
 * HLD Concept:
 * - Each physical node gets multiple virtual nodes on the ring
 * - Keys are hashed and placed on the ring
 * - Walk clockwise to find the responsible node
 * - Adding/removing nodes only affects K/N keys (minimal disruption)
 */

const crypto = require('crypto');

class ConsistentHashRing {
    /**
     * @param {number} virtualNodesPerNode - Number of virtual nodes per physical node
     */
    constructor(virtualNodesPerNode = 150) {
        this.virtualNodesPerNode = virtualNodesPerNode;
        this.ring = [];              // Sorted array of { hash, nodeId }
        this.nodes = new Set();      // Set of physical node IDs
    }

    /**
     * Hash a string to a 32-bit integer position on the ring
     * Uses SHA-256 and takes first 4 bytes as uint32
     */
    _hash(key) {
        const hash = crypto.createHash('sha256').update(key).digest();
        // Read first 4 bytes as unsigned 32-bit integer
        return hash.readUInt32BE(0);
    }

    /**
     * Add a physical node to the ring with virtual nodes
     * @param {string} nodeId - e.g., "cache-node-1"
     */
    addNode(nodeId) {
        if (this.nodes.has(nodeId)) return;
        this.nodes.add(nodeId);

        for (let i = 0; i < this.virtualNodesPerNode; i++) {
            const virtualKey = `${nodeId}:vn${i}`;
            const hash = this._hash(virtualKey);
            this.ring.push({ hash, nodeId });
        }

        // Keep ring sorted by hash value for binary search
        this.ring.sort((a, b) => a.hash - b.hash);
    }

    /**
     * Remove a physical node and all its virtual nodes from the ring
     * @param {string} nodeId
     */
    removeNode(nodeId) {
        if (!this.nodes.has(nodeId)) return;
        this.nodes.delete(nodeId);
        this.ring = this.ring.filter(entry => entry.nodeId !== nodeId);
    }

    /**
     * Find the responsible node for a given key
     * Uses binary search to find the first node clockwise on the ring
     * 
     * @param {string} key - The key to look up (e.g., a prefix like "iph")
     * @returns {{ nodeId: string, hash: number }} - The responsible node and key hash
     */
    getNode(key) {
        if (this.ring.length === 0) {
            throw new Error('No nodes in the hash ring');
        }

        const keyHash = this._hash(key);

        // Binary search: find the first node with hash >= keyHash
        let low = 0;
        let high = this.ring.length - 1;
        let result = 0; // Default: wrap around to first node

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.ring[mid].hash >= keyHash) {
                result = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }

        // If no node found with hash >= keyHash, wrap around to first node
        if (low > this.ring.length - 1) {
            result = 0;
        }

        return {
            nodeId: this.ring[result].nodeId,
            hash: keyHash,
            ringPosition: this.ring[result].hash
        };
    }

    /**
     * Get distribution statistics for each physical node
     * Shows how many virtual nodes each physical node has on the ring
     */
    getDistribution() {
        const distribution = {};
        for (const node of this.nodes) {
            distribution[node] = 0;
        }
        for (const entry of this.ring) {
            distribution[entry.nodeId]++;
        }
        return distribution;
    }

    /**
     * Get ring state for debugging
     */
    getRingState() {
        return {
            totalNodes: this.nodes.size,
            physicalNodes: Array.from(this.nodes),
            virtualNodesPerNode: this.virtualNodesPerNode,
            totalRingEntries: this.ring.length,
            distribution: this.getDistribution()
        };
    }
}

module.exports = ConsistentHashRing;
