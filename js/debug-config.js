// debug-config.js – Point this to your actual particle list
window.DebugConfig = {
    // Helper: update stats for a single particle
    _countParticleState: function(p, stats) {
        stats.total++;
        switch (p.state) {
            case 'warm': stats.warm++; break;
            case 'cool': stats.cool++; break;
            case 'burnt': stats.burnt++; break;
            default: stats.normal++; break;
        }
    },

    // Returns an object: { total, warm, cool, burnt, normal, ... }
    getParticleStats: function() {
        const stats = { total: 0, warm: 0, cool: 0, burnt: 0, normal: 0 };
        const particles = window.Sim?.state?.loose || [];
        
        for (const p of particles) {
            this._countParticleState(p, stats);
        }
        return stats;
    },
    
    getDrawTime: function() { return window.__lastDrawTime || 0; }
};