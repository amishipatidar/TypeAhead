# Search Typeahead System

A high-level design (HLD) based search typeahead system built with **Node.js**, **Redis**, and **Consistent Hashing**. Demonstrates real-world system design concepts including distributed caching, batch writes, sampling, and decay-based trending.

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                     Frontend (HTML/CSS/JS)              │
│  Search Bar → Debounced Input → Suggestion Dropdown     │
│  Trending Section → Performance Dashboard               │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP
┌─────────────────────▼───────────────────────────────────┐
│                  Node.js + Express Server               │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Sampler  │→ │  Batch   │→ │  Decay   │               │
│  │ (rand<p) │  │Processor │  │   Job    │               │
│  └──────────┘  │(count%n) │  │(×0.9/day)│               │
│                └──────────┘  └──────────┘               │
│                                                         │
│  ┌────────────────────────────────────────┐             │
│  │     Consistent Hash Ring               │             │
│  │  ┌──────────┐┌──────────┐┌──────────┐ │              │
│  │  │ Node 1   ││ Node 2   ││ Node 3   │ │              │
│  │  └──────────┘└──────────┘└──────────┘ │              │
│  └────────────────────────────────────────┘             │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                    Redis (Docker)                       │
│  DB 0: Frequency Store    │  DB 1: Suggestions Store    │
│  freq:<query> → count     │  sugg:<prefix> → top-k JSON │
└─────────────────────────────────────────────────────────┘
```

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- Docker Desktop

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd search-typeahead

# 2. Start Redis via Docker
docker compose up -d

# 3. Install dependencies
npm install

# 4. Generate & load dataset (120K+ queries)
npm run seed

# 5. Start the server
npm start

# 6. Open in browser
# http://localhost:3000
```

## API Documentation

### GET /suggest?q=\<prefix\>
Returns up to 10 suggestions matching the prefix, sorted by count.

```bash
curl "http://localhost:3000/suggest?q=iph"
```

Response:
```json
{
  "prefix": "iph",
  "suggestions": [
    { "query": "iphone", "count": 95000 },
    { "query": "iphone price", "count": 42000 }
  ],
  "source": "cache",
  "node": "cache-node-2",
  "hit": true,
  "latencyMs": 2
}
```

### POST /search
Submit a search query. Returns "Searched" and records the query.

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "iphone 16 pro max"}'
```

Response:
```json
{
  "message": "Searched",
  "query": "iphone 16 pro max",
  "sampled": true,
  "newCount": 5,
  "batchTriggered": true
}
```

### GET /trending
Returns top 10 trending queries (ranked by decayed count).

```bash
curl "http://localhost:3000/trending"
```

### GET /cache/debug?prefix=\<prefix\>
Shows consistent hashing routing details.

```bash
curl "http://localhost:3000/cache/debug?prefix=iph"
```

Response shows: hash value, assigned node, hit/miss, TTL, ring distribution.

### GET /stats
Returns performance metrics.

```bash
curl "http://localhost:3000/stats"
```

## Dataset

- **Source**: Synthetically generated (120K+ queries)
- **Categories**: Tech, Programming, Shopping, Health, Entertainment, Food, Travel, Education, Finance, Questions
- **Distribution**: Zipf distribution (few very popular queries, many with low counts)
- **Location**: `data/queries.csv`
- **Format**: `query,count`

Generate a new dataset: `npm run generate`

## Design Choices & Trade-offs

### Two Separate Stores (Not a Trie)
- **Frequency Store** (Redis DB 0): Stores raw `query → count`
- **Suggestions Store** (Redis DB 1): Stores precomputed `prefix → top-k suggestions`
- **Why not a Trie?** No popular database has native trie support. Key-value stores (Redis) provide O(1) lookups and are horizontally scalable.

### Consistent Hashing
- SHA-256 hash ring with 150 virtual nodes per physical node
- 3 logical cache nodes for even distribution
- Binary search for O(log n) node lookup
- Adding/removing nodes only affects K/N keys (minimal disruption)

### Batch Processing
- Suggestions are updated only when `count % batch_size == 0`
- Reduces write pressure from N writes to N/batch_size writes
- **Trade-off**: Suggestions may be slightly stale (eventual consistency), but this is acceptable for typeahead

### Sampling
- Only a configurable fraction of searches are processed
- Reduces both frequency writes and suggestion updates
- **Trade-off**: Individual data points may be lost, but overall trends are preserved
- Rare queries are naturally filtered out (they wouldn't appear in top-k suggestions anyway)

### Decay-Based Trending
- Periodically multiply all counts by 0.9
- Recent searches naturally rank higher (their counts haven't decayed yet)
- Old viral queries fade over time
- **Steady-state**: A query searched constantly converges to `count/(1-decay)` = stable ceiling
- **Trade-off**: Simplicity over precision — no per-query timestamps needed for ranking

### Failure Analysis
- **App crashes before batch flush**: Frequency DB has the latest counts (always updated). Only the suggestions cache may be slightly behind. Recovery: rebuild suggestions from frequency store.
- **Redis crashes**: Data persisted via AOF (append-only file). Recovery on restart.
- **Cache node failure**: Consistent hashing means only K/N keys need redistribution.

## Performance

Measured on local machine:

| Metric | Value |
|--------|-------|
| p95 suggestion latency (cached) | < 10ms |
| Cache hit rate (repeated queries) | > 70% |
| Write reduction (batch_size=5) | ~5x |
| Dataset size | 120K+ queries |

## Configuration

All parameters are configurable via `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| BATCH_SIZE | 5 | Update suggestions every N count increments |
| SAMPLE_RATE | 1.0 | Fraction of searches to process (0.0–1.0) |
| DECAY_FACTOR | 0.9 | Multiply counts by this factor each decay cycle |
| DECAY_INTERVAL_SECONDS | 60 | Seconds between decay cycles |
| CACHE_TTL_SECONDS | 300 | Cache entry TTL |
| CACHE_NODE_COUNT | 3 | Number of logical cache nodes |
| VIRTUAL_NODES_PER_NODE | 150 | Virtual nodes per physical node on hash ring |
| TOP_K | 10 | Number of suggestions to return |

## License

MIT
