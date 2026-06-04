// js/physics/softbody.js

export function generateSoftBody({ radius, density, presetMesh }) {
    // Use baked mesh if provided
    if (presetMesh) {
        return {
            type: "baked",
            nodes: presetMesh.nodes,
            springs: presetMesh.springs,
            presetMesh
        };
    }

    // Simple generated radial mesh
    const segments = Math.max(12, Math.floor(radius / 4));
    const nodes = [];
    const springs = [];

    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        nodes.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            mass: density
        });
    }

    for (let i = 0; i < segments; i++) {
        const a = i;
        const b = (i + 1) % segments;
        springs.push({
            a,
            b,
            stiffness: 0.8,
            restLength: distance(nodes[a], nodes[b])
        });
    }

    return {
        type: "generated",
        nodes,
        springs
    };
}

function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
