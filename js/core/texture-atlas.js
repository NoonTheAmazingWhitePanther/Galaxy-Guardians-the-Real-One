// js/core/texture-atlas.js

export async function loadTextureAtlas(atlasUrl) {
    const atlasRes = await fetch(atlasUrl);
    if (!atlasRes.ok) {
        throw new Error(`Failed to load atlas: ${atlasUrl}`);
    }
    const atlas = await atlasRes.json();

    const image = await loadImage(atlas.image);

    return {
        image,
        frames: atlas.frames
    };
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
    });
}
