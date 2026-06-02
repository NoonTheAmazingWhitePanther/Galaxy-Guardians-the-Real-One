/**
 * js/core/registry.js
 * Central registry for Prime Modules, Data Blueprints, and Active Instances.
 * Enables drop-in extensibility and modding without touching core engine code.
 */

export const Registry = {
    // 1. PRIME MODULES (e.g., SunModule, PlanetModule)
    modules: new Map(),
    
    registerModule: (type, module) => {
        if (Registry.modules.has(type)) {
            console.warn(`[Registry] Module '${type}' already exists. Overwriting.`);
        }
        Registry.modules.set(type, module);
        if (module.init) module.init();
        console.log(`[Registry] Registered Module: ${type}`);
    },

    getModule: (type) => Registry.modules.get(type),

    // 2. DATA BLUEPRINTS (e.g., JSON definitions for planets, asteroids, or uploaded images)
    blueprints: new Map(),

    registerBlueprint: (id, blueprintData) => {
        Registry.blueprints.set(id, blueprintData);
        console.log(`[Registry] Registered Blueprint: ${id}`);
    },

    getBlueprint: (id) => Registry.blueprints.get(id),

    // 3. ACTIVE INSTANCES (For self-cleaning and lifecycle management)
    activeInstances: new Map(),

    registerInstance: (id, instance) => {
        Registry.activeInstances.set(id, instance);
    },

    removeInstance: (id) => {
        const instance = Registry.activeInstances.get(id);
        if (instance) {
            // SELF-CLEANING: Call destroy if the module defines it
            if (instance.destroy && typeof instance.destroy === 'function') {
                instance.destroy();
            }
            Registry.activeInstances.delete(id);
        }
    },

    // 4. MOD OVERRIDES (Allows mods to safely replace default behaviors)
    overrides: new Map(),

    registerOverride: (targetId, overrideData) => {
        Registry.overrides.set(targetId, overrideData);
        console.log(`[Registry] Registered Mod Override for: ${targetId}`);
    },

    getResolvedData: (targetId, defaultData) => {
        const override = Registry.overrides.get(targetId);
        return override ? { ...defaultData, ...override } : defaultData;
    },

    // 5. UTILITIES
    clearAll: () => {
        // Clean up all active instances first
        for (const id of Registry.activeInstances.keys()) {
            Registry.removeInstance(id);
        }
        Registry.modules.clear();
        Registry.blueprints.clear();
        Registry.overrides.clear();
        console.log('[Registry] Cleared all registrations.');
    }
};