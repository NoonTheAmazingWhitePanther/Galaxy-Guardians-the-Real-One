/**
 * js/core/loader.js
 * Dynamic, on-demand module loader with caching.
 * Ensures scripts are only fetched and executed when explicitly called.
 */
export const Loader = {
    cache: new Map(),

    /**
     * Lazily loads a module by path.
     * @param {string} path - Relative path to the module (e.g., './modules/physics/tick.js')
     * @returns {Promise<Object>} The imported module
     */
    async load(path) {
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }

        try {
            // Dynamic import: browser fetches this file ONLY when this function is called
            const module = await import(path);
            this.cache.set(path, module);
            console.log(`[Loader] Lazily loaded: ${path}`);
            return module;
        } catch (error) {
            console.error(`[Loader] Failed to load module: ${path}`, error);
            return null;
        }
    },

    /**
     * Clears the cache for a specific module (useful for mod hot-reloading)
     */
    unload(path) {
        this.cache.delete(path);
        console.log(`[Loader] Unloaded: ${path}`);
    },

    /**
     * Clears all cached modules (useful for switching mods or full reset)
     */
    clearCache() {
        this.cache.clear();
        console.log('[Loader] Cache cleared.');
    }
};