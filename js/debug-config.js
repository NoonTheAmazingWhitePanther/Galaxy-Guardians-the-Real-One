// debug-config.js – Point this to your actual particle list
// debug-config.js
// debug-config.js – Customize for your particle states
window.DebugConfig = {
    // Returns an object: { total, warm, cool, burnt, normal, ... }
    getParticleStats: function() {
        const stats = { total: 0, warm: 0, cool: 0, burnt: 0, normal: 0 };
        
        // Replace with your actual particle array
        const particles = window.Sim?.state?.loose || [];
        
        for (const p of particles) {
            stats.total++;
            // Replace 'p.state' with your actual property name
            switch (p.state) {
                case 'warm': stats.warm++; break;
                case 'cool': stats.cool++; break;
                case 'burnt': stats.burnt++; break;
                default: stats.normal++; break;
            }
        }
        return stats;
    },
    
    getDrawTime: function() { return window.__lastDrawTime || 0; }

};