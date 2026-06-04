// js/core/config-loader.js

export async function loadPlanetConfigFromUrl(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to load planet config from ${url}: ${res.status}`);
    }
    return await res.json();
}

export async function loadPlanetConfigsFromManifest(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to load planet manifest from ${url}: ${res.status}`);
    }
    const manifest = await res.json(); // e.g. [ "configs/earth.json", "configs/mars.json" ]
    return Promise.all(manifest.map(loadPlanetConfigFromUrl));
}
