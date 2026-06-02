/**
 * js/core/math.js
 * Pure math utilities extracted from utils.js. Worker-safe.
 */
export const PI2 = Math.PI * 2;
export const rnd = Math.random.bind(Math);
export const rndR = (a, b) => a + (b - a) * rnd();
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const hypot = Math.hypot;

export const makeRockShape = (r) => {
    const n = Math.floor(rndR(5, 9));
    return Array.from({ length: n }, (_, i) => {
        const baseA = (PI2 / n) * i + (rnd() - 0.5) * (PI2 / n) * 0.55;
        const rv = r * (0.55 + rnd() * 0.55);
        return [Math.cos(baseA) * rv, Math.sin(baseA) * rv];
    });
};

export const convexHull = (pts) => {
    if (pts.length < 3) return pts;
    let lo = pts[0];
    for (const p of pts) {
        if (p.y > lo.y || (p.y === lo.y && p.x < lo.x)) lo = p;
    }
    const hull = [lo];
    let cur = lo;
    while (true) {
        let next = pts[0];
        for (const p of pts) {
            if (p === cur) continue;
            const cross = (next.x - cur.x) * (p.y - cur.y) - (next.y - cur.y) * (p.x - cur.x);
            if (cross < 0 || (cross === 0 && hypot(p.x - cur.x, p.y - cur.y) > hypot(next.x - cur.x, next.y - cur.y))) {
                next = p;
            }
        }
        if (next === lo) break;
        hull.push(next);
        cur = next;
        if (hull.length > pts.length) break;
    }
    return hull;
};

export const getPlanetRadius = (sliderVal, charge = 0) => {
    const raw = sliderVal * (1 + charge * 4);
    const t = clamp(raw / 50, 0, 1);
    const multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
    const baseRadius = 40;
    return clamp(Math.round(baseRadius * multiplier), 10, 110);
};