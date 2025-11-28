// Simple in-memory cache for better performance
// No external dependencies needed - completely FREE!

class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0
        };
    }

    /**
     * Store a value in cache with TTL
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttlSeconds - Time to live in seconds (default: 5 minutes)
     */
    set(key, value, ttlSeconds = 300) {
        const expiry = Date.now() + (ttlSeconds * 1000);
        this.cache.set(key, { value, expiry });
        this.stats.sets++;

        // Auto-cleanup expired entries every 10 minutes
        if (this.stats.sets % 100 === 0) {
            this.cleanup();
        }
    }

    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @returns {any|null} Cached value or null if not found/expired
     */
    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.value;
    }

    /**
     * Delete a specific cache key
     * @param {string} key - Cache key to delete
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache entries
     */
    clear() {
        this.cache.clear();
        console.log('🗑️ Cache cleared');
    }

    /**
     * Remove expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiry) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
        }
    }

    /**
     * Get cache statistics
     * @returns {object} Cache stats
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2)
            : 0;

        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            sets: this.stats.sets,
            hitRate: `${hitRate}%`
        };
    }

    /**
     * Log cache statistics
     */
    logStats() {
        const stats = this.getStats();
        console.log('📊 Cache Statistics:', stats);
    }
}

// Export singleton instance
module.exports = new SimpleCache();

// Cleanup expired entries every 10 minutes
setInterval(() => {
    module.exports.cleanup();
}, 10 * 60 * 1000);
