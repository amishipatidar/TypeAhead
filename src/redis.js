/**
 * Redis Client Setup (with In-Memory Fallback)
 * 
 * Tries to connect to Redis. If Redis is not available,
 * falls back to in-memory Map-based stores that behave identically.
 * 
 * In your viva, explain:
 * "In production, these are Redis instances. For the demo, 
 *  the system auto-detects Redis availability and can fall back 
 *  to in-memory stores with the same interface."
 */

const Redis = require('ioredis');
require('dotenv').config();

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT) || 6379;

let useRedis = true;
let frequencyClient, suggestionsClient, frequencyRawClient;

// ===========================
// In-Memory Fallback Store
// ===========================
class InMemoryRedis {
    constructor(options = {}) {
        this.store = new Map();
        this.ttls = new Map();
        this.prefix = options.keyPrefix || '';
        this._connected = true;
    }

    _fullKey(key) {
        return this.prefix + key;
    }

    async get(key) {
        const fk = this._fullKey(key);
        // Check TTL
        if (this.ttls.has(fk)) {
            if (Date.now() > this.ttls.get(fk)) {
                this.store.delete(fk);
                this.ttls.delete(fk);
                return null;
            }
        }
        return this.store.get(fk) || null;
    }

    async set(key, value) {
        this.store.set(this._fullKey(key), String(value));
        return 'OK';
    }

    async setex(key, seconds, value) {
        const fk = this._fullKey(key);
        this.store.set(fk, String(value));
        this.ttls.set(fk, Date.now() + seconds * 1000);
        return 'OK';
    }

    async del(...keys) {
        let count = 0;
        for (const key of keys) {
            const fk = this._fullKey(key);
            if (this.store.delete(fk)) count++;
            this.ttls.delete(fk);
        }
        return count;
    }

    async incrby(key, amount) {
        const fk = this._fullKey(key);
        const current = parseInt(this.store.get(fk)) || 0;
        const newVal = current + amount;
        this.store.set(fk, String(newVal));
        return newVal;
    }

    async ttl(key) {
        const fk = this._fullKey(key);
        if (this.ttls.has(fk)) {
            const remaining = Math.floor((this.ttls.get(fk) - Date.now()) / 1000);
            return remaining > 0 ? remaining : -2;
        }
        return this.store.has(fk) ? -1 : -2;
    }

    async scan(cursor, ...args) {
        // Parse MATCH and COUNT from args
        let pattern = '*';
        let count = 10;
        for (let i = 0; i < args.length; i += 2) {
            if (args[i] === 'MATCH') pattern = args[i + 1];
            if (args[i] === 'COUNT') count = parseInt(args[i + 1]);
        }

        // Convert glob pattern to regex
        const regexStr = '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
        const regex = new RegExp(regexStr);

        const allKeys = Array.from(this.store.keys()).filter(k => regex.test(k));
        
        // Clean expired keys
        const validKeys = allKeys.filter(k => {
            if (this.ttls.has(k) && Date.now() > this.ttls.get(k)) {
                this.store.delete(k);
                this.ttls.delete(k);
                return false;
            }
            return true;
        });

        const start = parseInt(cursor) || 0;
        const batch = validKeys.slice(start, start + count);
        const nextCursor = start + count >= validKeys.length ? '0' : String(start + count);

        return [nextCursor, batch];
    }

    async flushdb() {
        this.store.clear();
        this.ttls.clear();
        return 'OK';
    }

    pipeline() {
        return new InMemoryPipeline(this);
    }

    on(event, cb) {
        if (event === 'connect') setTimeout(cb, 0);
    }

    disconnect() {}
}

class InMemoryPipeline {
    constructor(client) {
        this.client = client;
        this.commands = [];
    }

    set(key, value) {
        this.commands.push(() => this.client.set(key, value));
        return this;
    }

    get(key) {
        this.commands.push(() => this.client.get(key));
        return this;
    }

    del(...keys) {
        this.commands.push(() => this.client.del(...keys));
        return this;
    }

    async exec() {
        const results = [];
        for (const cmd of this.commands) {
            try {
                const result = await cmd();
                results.push([null, result]);
            } catch (err) {
                results.push([err, null]);
            }
        }
        this.commands = [];
        return results;
    }
}

// ===========================
// Try Redis, fallback to In-Memory
// ===========================
async function initializeClients() {
    return new Promise((resolve) => {
        const testClient = new Redis({
            host: REDIS_HOST,
            port: REDIS_PORT,
            connectTimeout: 3000,
            maxRetriesPerRequest: 1,
            retryStrategy() { return null; } // Don't retry
        });

        testClient.on('connect', () => {
            console.log('✅ Redis is available — using Redis for storage');
            testClient.disconnect();
            useRedis = true;

            frequencyClient = new Redis({
                host: REDIS_HOST, port: REDIS_PORT, db: 0,
                keyPrefix: 'freq:',
                retryStrategy(times) { return Math.min(times * 50, 2000); }
            });

            suggestionsClient = new Redis({
                host: REDIS_HOST, port: REDIS_PORT, db: 1,
                retryStrategy(times) { return Math.min(times * 50, 2000); }
            });

            frequencyRawClient = new Redis({
                host: REDIS_HOST, port: REDIS_PORT, db: 0,
                retryStrategy(times) { return Math.min(times * 50, 2000); }
            });

            frequencyClient.on('connect', () => console.log('  ✅ Redis Frequency Store (DB 0) connected'));
            suggestionsClient.on('connect', () => console.log('  ✅ Redis Suggestions Store (DB 1) connected'));

            resolve();
        });

        testClient.on('error', () => {
            console.log('⚠️  Redis not available — using in-memory fallback stores');
            console.log('   (Start Redis with "docker compose up -d" for actual Redis)');
            testClient.disconnect();
            useRedis = false;

            frequencyClient = new InMemoryRedis({ keyPrefix: 'freq:' });
            suggestionsClient = new InMemoryRedis({});
            frequencyRawClient = new InMemoryRedis({});

            console.log('  ✅ In-Memory Frequency Store (DB 0) ready');
            console.log('  ✅ In-Memory Suggestions Store (DB 1) ready');

            resolve();
        });
    });
}

// Initialize synchronously with in-memory defaults
// (will be replaced if Redis connects)
frequencyClient = new InMemoryRedis({ keyPrefix: 'freq:' });
suggestionsClient = new InMemoryRedis({});
frequencyRawClient = new InMemoryRedis({});

module.exports = {
    get frequencyClient() { return frequencyClient; },
    get suggestionsClient() { return suggestionsClient; },
    get frequencyRawClient() { return frequencyRawClient; },
    get useRedis() { return useRedis; },
    initializeClients,
    InMemoryRedis
};
