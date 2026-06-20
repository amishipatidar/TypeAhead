# Architecture — Search Typeahead System

## Overview

This system implements a search typeahead (autocomplete) feature using HLD principles. Instead of building an in-memory Trie, we use the **Key-Value / HashMap approach** — two separate data stores that together provide ultra-low-latency prefix lookups.

## Core Architecture: Two Stores

### Store 1: Search Frequency DB (Redis DB 0)

**Purpose**: The source of truth for how many times each query has been searched.

```
Key Pattern: freq:<query>
Example:     freq:iphone 15 → 85000
```

This is the equivalent of `redis.incr(searchQuery)` from the class notes. Every time a search is submitted (and passes sampling), this counter is incremented.

### Store 2: Top Suggestions DB (Redis DB 1)

**Purpose**: Precomputed cache that stores the top-k suggestions for every prefix.

```
Key Pattern: sugg:<prefix>
Example:     sugg:iph → [{"query":"iphone","count":100000}, {"query":"iphone 15","count":85000}, ...]
```

This is the "data augmentation" from the Trie approach, but stored as a separate cache. As the class notes explain:

> "As a HLD person, we will realize that effectively, we're just caching the top-k results for each possible prefix."

## Data Flow

### 1. Typeahead Query (Read Path)

```
User types "iph"
    → GET /suggest?q=iph
    → Consistent Hash Ring: hash("iph") → cache-node-2
    → Check cache: cache:cache-node-2:iph
        → HIT: Return cached suggestions (< 1ms)
        → MISS: 
            → Check Suggestions Store: sugg:iph
            → If found: Cache it in cache-node-2, return
            → If not found: SCAN Frequency Store for freq:iph*, sort, return top 10
```

### 2. Search Submission (Write Path)

```
User searches "iphone 16 pro"
    → POST /search { query: "iphone 16 pro" }
    → Sampling Gate: if rand() < SAMPLE_RATE → process
    → Frequency Store: INCR freq:iphone 16 pro → returns newCount
    → Batch Check: if newCount % BATCH_SIZE === 0 → trigger update
        → For each prefix of "iphone 16 pro":
            ["i", "ip", "iph", "ipho", ..., "iphone 16 pro"]
            → Update sugg:<prefix> with new top-k
            → Invalidate cache:node-X:<prefix>
```

### 3. Decay Cycle (Background)

```
Every DECAY_INTERVAL seconds:
    → SCAN all freq:* keys
    → Multiply each count by DECAY_FACTOR (0.9)
    → Remove entries below REMOVAL_THRESHOLD
    → Rebuild all sugg:* entries from updated counts
    → Clear all cache:* entries
```

## Consistent Hashing

### Why Consistent Hashing?

In a distributed cache, we need to decide which cache node stores a given prefix. Simple `hash(key) % N` breaks when nodes are added/removed — almost all keys remap.

Consistent hashing ensures:
- Only **K/N** keys need to be remapped when a node is added/removed
- **Even distribution** via virtual nodes (150 per physical node)

### Implementation

```
Hash Ring: 0 ──────────────────────── 2^32 - 1

Physical Nodes: cache-node-1, cache-node-2, cache-node-3
Virtual Nodes: 150 per node = 450 total ring positions

Lookup: hash("iph") = 1847362819
        Binary search → first node clockwise → cache-node-2
```

Each prefix is mapped to a single cache node. The cache key becomes:
```
cache:<node-id>:<prefix>
e.g., cache:cache-node-2:iph
```

### Debug Endpoint

`GET /cache/debug?prefix=iph` shows:
- Hash value of the prefix
- Which node it maps to
- Whether it's a cache hit or miss
- TTL remaining
- Key distribution across all nodes

## Write Optimization

### Problem (from class notes)

```
For each search submission:
- 1 write to frequency store
- ~10 writes to suggestions store (one per prefix)

At 1M searches/sec:
- 1M + 10M = 11M writes/sec → both read AND write heavy!
```

### Solution 1: Batching

```
Only update suggestions when count % BATCH_SIZE == 0

Before: 1M + 10M = 11M writes/sec
After:  1M + 10K = 1.01M writes/sec (with batch_size=1000)
```

Batching doesn't cause data loss — frequency counts are always up-to-date. It only causes **stale reads** in the suggestions (eventual consistency).

### Solution 2: Sampling

```
Only process a fraction of searches:
if (Math.random() < 0.001) → process this search

Before: 11M writes/sec
After:  11K writes/sec
```

Sampling causes **data loss** of individual data points, but preserves overall trends. Rare queries are filtered out naturally — they'd never appear in top-k anyway.

## Trending: Decay-Based Approach

### The Problem

A query like "why is the sky blue?" has a very high all-time count. But when a trending event happens ("what happened in Nepal?"), the trending query should rank higher even though its all-time count is lower.

### Solution: Exponential Decay

```
Every day (or configurable period):
    new_count = old_count × 0.9

Day  1: 1000
Day  2: 900 + new_searches
Day  3: 810 + new_searches
Day 10: ~349 + new_searches
Day 50: ~5 + new_searches (if no new searches)
```

**Steady-state**: A query searched `S` times per day converges to `S / (1 - 0.9) = 10S`

**Trending spike**: A query that's suddenly popular gets a high count immediately, ranks high, then naturally fades if interest drops.

**Removal**: If count drops below a threshold, the entry is removed — keeping the database clean.

### Why This Works Better Than Separate Windows

The class notes present an alternative: maintain `total_count`, `week_count`, `day_count` separately. The decay approach is simpler:
- **One counter** instead of three
- **No window management** — decay handles it automatically
- **Smooth ranking** — no sudden drops when a query falls out of a time window

### Trade-off
- **Pro**: Simple, automatic, memory-efficient
- **Con**: Can't distinguish "10 searches today" from "1000 searches 2 weeks ago decayed to 10"

## Failure Analysis

| Failure Mode | Impact | Recovery |
|---|---|---|
| App crash before batch flush | Frequency DB is up-to-date. Suggestions may be stale for recently updated queries. | Rebuild suggestions from frequency store on restart. |
| Redis crash | Data loss if AOF not synced. | Redis AOF ensures durability (configured: `appendonly yes`). |
| Cache node failure | Only K/N keys affected. | Consistent hashing redistributes. Cache misses trigger DB reads. |
| Network partition | Some requests may timeout. | Retry with fallback to local computation. |
