/**
 * Frontend Application Logic
 * 
 * Features:
 * - Debounced search input (300ms)
 * - Keyboard navigation (↑↓ Enter Esc) for both Suggestions and Trending lists
 * - Suggestion dropdown with cache/db source indicator
 * - Zero-state layout showing Trending Searches when query is empty
 * - Search submission with sleek toast notifications
 * - Collapsible Developer Tools (System Telemetry) with transition effects
 * - Live auto-refreshing performance dashboard & hash ring routing debugging
 */

const API_BASE = '';
const DEBOUNCE_MS = 300;
const STATS_REFRESH_MS = 5000;
const TRENDING_REFRESH_MS = 10000;

// ===========================
// State
// ===========================
let debounceTimer = null;
let activeIndex = -1;
let suggestions = [];
let toastTimer = null;

// ===========================
// DOM Elements
// ===========================
const searchInput = document.getElementById('searchInput');
const searchContainer = document.getElementById('searchContainer');
const suggestionsDropdown = document.getElementById('suggestionsDropdown');
const trendingView = document.getElementById('trendingView');
const trendingList = document.getElementById('trendingList');
const suggestionsView = document.getElementById('suggestionsView');
const suggestionsList = document.getElementById('suggestionsList');
const suggestSource = document.getElementById('suggestSource');
const suggestLatency = document.getElementById('suggestLatency');
const loadingIndicator = document.getElementById('loadingIndicator');
const searchToast = document.getElementById('searchToast');
const toastMessage = document.getElementById('toastMessage');

// Telemetry elements
const toggleTelemetryBtn = document.getElementById('toggleTelemetryBtn');
const telemetryPanel = document.getElementById('telemetryPanel');
const searchStage = document.querySelector('.search-stage');
const debugInput = document.getElementById('debugInput');
const debugBtn = document.getElementById('debugBtn');
const debugOutput = document.getElementById('debugOutput');

// ===========================
// Telemetry Panel Toggle
// ===========================
if (toggleTelemetryBtn && telemetryPanel && searchStage) {
    toggleTelemetryBtn.addEventListener('click', () => {
        const isOpen = telemetryPanel.classList.contains('open');
        if (isOpen) {
            telemetryPanel.classList.remove('open');
            toggleTelemetryBtn.classList.remove('active');
            searchStage.classList.remove('shifted');
            // Add hidden display style after the transition completes (0.5s)
            setTimeout(() => {
                if (!telemetryPanel.classList.contains('open')) {
                    telemetryPanel.classList.add('hidden');
                }
            }, 500);
        } else {
            telemetryPanel.classList.remove('hidden');
            // Force a reflow to trigger transition
            telemetryPanel.offsetHeight;
            telemetryPanel.classList.add('open');
            toggleTelemetryBtn.classList.add('active');
            searchStage.classList.add('shifted');
        }
    });
}

// ===========================
// Search Input Event Listeners
// ===========================
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    
    if (debounceTimer) clearTimeout(debounceTimer);
    
    if (!query) {
        showTrending();
        return;
    }

    debounceTimer = setTimeout(() => {
        fetchSuggestions(query);
    }, DEBOUNCE_MS);
});

searchInput.addEventListener('focus', () => {
    const query = searchInput.value.trim();
    if (!query) {
        showTrending();
    } else {
        if (suggestions.length > 0) {
            showSuggestions();
        } else {
            fetchSuggestions(query);
        }
    }
});

// ===========================
// Keyboard Navigation
// ===========================
searchInput.addEventListener('keydown', (e) => {
    const activeView = suggestionsView.classList.contains('hidden') ? trendingView : suggestionsView;
    const items = activeView.querySelectorAll('.trending-item, .suggestion-item');
    if (!items.length) return;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            updateActiveItem(items);
            break;
            
        case 'ArrowUp':
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, -1);
            updateActiveItem(items);
            break;
            
        case 'Enter':
            e.preventDefault();
            if (activeIndex >= 0 && items[activeIndex]) {
                const query = items[activeIndex].dataset.query;
                searchInput.value = query;
                hideSuggestions();
                submitSearch(query);
            } else if (searchInput.value.trim()) {
                hideSuggestions();
                submitSearch(searchInput.value.trim());
            }
            break;
            
        case 'Escape':
            hideSuggestions();
            searchInput.blur();
            break;
    }
});

// ===========================
// Close dropdown on outside click
// ===========================
document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
        hideSuggestions();
    }
});

// ===========================
// Dropdown Visibility Control
// ===========================
function showTrending() {
    suggestionsView.classList.add('hidden');
    trendingView.classList.remove('hidden');
    suggestionsDropdown.classList.remove('hidden');
    activeIndex = -1;
}

function showSuggestions() {
    trendingView.classList.add('hidden');
    suggestionsView.classList.remove('hidden');
    suggestionsDropdown.classList.remove('hidden');
    activeIndex = -1;
}

function hideSuggestions() {
    suggestionsDropdown.classList.add('hidden');
    activeIndex = -1;
}

// ===========================
// Fetch Suggestions
// ===========================
async function fetchSuggestions(prefix) {
    try {
        showLoading();
        const res = await fetch(`${API_BASE}/suggest?q=${encodeURIComponent(prefix)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        suggestions = data.suggestions || [];
        hideLoading();

        if (suggestions.length === 0) {
            hideSuggestions();
            return;
        }

        renderSuggestions(prefix, data);
    } catch (err) {
        hideLoading();
        console.error('Suggest error:', err);
    }
}

// ===========================
// Render Suggestions
// ===========================
function renderSuggestions(prefix, data) {
    activeIndex = -1;
    suggestionsList.innerHTML = '';

    for (const item of data.suggestions) {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.dataset.query = item.query;

        // Highlight the matching prefix
        const matchEnd = prefix.length;
        const highlighted = `<span class="highlight">${escapeHtml(item.query.substring(0, matchEnd))}</span>${escapeHtml(item.query.substring(matchEnd))}`;

        div.innerHTML = `
            <svg class="suggestion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span class="suggestion-text">${highlighted}</span>
            <span class="trending-count">${formatCount(item.count)}</span>
        `;

        div.addEventListener('click', () => {
            searchInput.value = item.query;
            hideSuggestions();
            submitSearch(item.query);
        });

        div.addEventListener('mouseenter', () => {
            const activeView = suggestionsView.classList.contains('hidden') ? trendingView : suggestionsView;
            const allItems = activeView.querySelectorAll('.trending-item, .suggestion-item');
            activeIndex = Array.from(allItems).indexOf(div);
            updateActiveItem(allItems);
        });

        suggestionsList.appendChild(div);
    }

    // Update footer
    const sourceColor = data.source === 'cache' ? 'cache' : 'db';
    suggestSource.innerHTML = `<span class="dot ${sourceColor}"></span> ${data.source === 'cache' ? 'Cache Hit' : 'DB Query'} → ${data.node || 'N/A'}`;
    suggestLatency.textContent = `${data.latencyMs}ms`;

    showSuggestions();
}

// ===========================
// Submit Search
// ===========================
async function submitSearch(query) {
    try {
        const res = await fetch(`${API_BASE}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Show toast
        let msg = `"${query}" — Searched!`;
        if (data.sampled) {
            msg += data.batchTriggered ? ' (Batch updated)' : ` (Count: ${data.newCount})`;
        } else {
            msg += ' (Sampled out)';
        }
        showToast(msg);

        // Refresh trending & stats
        fetchTrending();
        fetchStats();

    } catch (err) {
        showToast('Search failed — check server');
        console.error('Search error:', err);
    }
}

// ===========================
// Fetch & Render Trending
// ===========================
async function fetchTrending() {
    try {
        const res = await fetch(`${API_BASE}/trending`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        renderTrending(data.trending || []);
    } catch (err) {
        trendingList.innerHTML = '<div style="padding: 12px 20px; color: var(--text-muted); font-size: 14px;">Failed to load trending</div>';
    }
}

function renderTrending(items) {
    if (items.length === 0) {
        trendingList.innerHTML = '<div style="padding: 12px 20px; color: var(--text-muted); font-size: 14px;">No trending queries yet</div>';
        return;
    }

    trendingList.innerHTML = '';
    items.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'trending-item';
        div.dataset.query = item.query;
        div.innerHTML = `
            <div class="trending-rank">#${i + 1}</div>
            <div class="trending-query">${escapeHtml(item.query)}</div>
            <div class="trending-count">${formatCount(item.count)}</div>
        `;
        div.addEventListener('click', () => {
            searchInput.value = item.query;
            hideSuggestions();
            submitSearch(item.query);
        });
        div.addEventListener('mouseenter', () => {
            const activeView = suggestionsView.classList.contains('hidden') ? trendingView : suggestionsView;
            const allItems = activeView.querySelectorAll('.trending-item, .suggestion-item');
            activeIndex = Array.from(allItems).indexOf(div);
            updateActiveItem(allItems);
        });
        trendingList.appendChild(div);
    });
}

// ===========================
// Performance Dashboard Stats
// ===========================
async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        updateDashboard(data);
    } catch (err) {
        console.error('Stats error:', err);
    }
}

function updateDashboard(data) {
    const m = data.metrics;
    const bp = data.batchProcessor;
    const d = data.decay;
    const ds = data.dataStore;

    // Cache Hit Rate
    if (document.getElementById('cacheHitRate')) {
        document.getElementById('cacheHitRate').textContent = m.cache.hitRate;
    }
    if (document.getElementById('cacheDetail')) {
        document.getElementById('cacheDetail').textContent = `Hits: ${m.cache.hits} | Misses: ${m.cache.misses}`;
    }

    // Write Reduction
    if (document.getElementById('writeReduction')) {
        document.getElementById('writeReduction').textContent = bp.writeReductionRatio;
    }
    if (document.getElementById('writeDetail')) {
        document.getElementById('writeDetail').textContent = `Processed: ${bp.totalProcessed} | Batches: ${bp.totalBatchTriggered}`;
    }

    // Latency
    if (document.getElementById('p95Latency')) {
        document.getElementById('p95Latency').textContent = m.latency.p95;
    }
    if (document.getElementById('latencyDetail')) {
        document.getElementById('latencyDetail').textContent = `Avg: ${m.latency.avg} | p99: ${m.latency.p99}`;
    }

    // Data Store
    if (document.getElementById('dataStoreCount')) {
        document.getElementById('dataStoreCount').textContent = formatCount(ds.frequencyStoreKeys);
    }
    if (document.getElementById('dataStoreDetail')) {
        document.getElementById('dataStoreDetail').textContent = `Freq: ${formatCount(ds.frequencyStoreKeys)} | Sugg: ${formatCount(ds.suggestionsStoreKeys)}`;
    }

    // Decay
    if (document.getElementById('decayStatus')) {
        document.getElementById('decayStatus').textContent = d.running ? 'Running' : `${d.runsCompleted} runs`;
    }
    if (document.getElementById('decayDetail')) {
        document.getElementById('decayDetail').textContent = `Factor: ${d.decayFactor} | Every ${d.intervalSeconds}s`;
    }
}

// ===========================
// Cache Debug
// ===========================
if (debugBtn && debugInput && debugOutput) {
    debugBtn.addEventListener('click', () => {
        const prefix = debugInput.value.trim();
        if (prefix) fetchDebug(prefix);
    });

    debugInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const prefix = debugInput.value.trim();
            if (prefix) fetchDebug(prefix);
        }
    });
}

async function fetchDebug(prefix) {
    try {
        debugOutput.textContent = 'Loading...';
        const res = await fetch(`${API_BASE}/cache/debug?prefix=${encodeURIComponent(prefix)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        debugOutput.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        debugOutput.textContent = `Error: ${err.message}`;
    }
}

// ===========================
// Helpers
// ===========================
function updateActiveItem(items) {
    items.forEach((item, i) => {
        item.classList.toggle('active', i === activeIndex);
    });
    // Scroll active item into view
    if (activeIndex >= 0 && items[activeIndex]) {
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }
}

function showLoading() {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
}

// Ensure load indicator stays aligned
function hideLoading() {
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

function showToast(msg) {
    if (!searchToast || !toastMessage) return;
    toastMessage.textContent = msg;
    searchToast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        searchToast.classList.add('hidden');
    }, 3000);
}

function formatCount(num) {
    if (num === undefined || num === null) return '--';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===========================
// Initialize
// ===========================
fetchTrending();
fetchStats();

// Auto-refresh
setInterval(fetchStats, STATS_REFRESH_MS);
setInterval(fetchTrending, TRENDING_REFRESH_MS);

// Focus search input on load
if (searchInput) searchInput.focus();
