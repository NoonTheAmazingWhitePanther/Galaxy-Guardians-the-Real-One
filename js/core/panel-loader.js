/**
 * js/core/panel-loader.js
 * Prime Module: PanelLoader — assembles the debug panel config from
 * INDIVIDUAL per-panel JSON files instead of one monolith.
 *
 * THE OLD WAY (gone): js/modules/debug/debug-config.json held every panel
 * as one entry in a single ~1000-line array. Adding a panel, handing one to
 * someone else to edit, or reviewing a diff all meant wading through the
 * whole file.
 *
 * THE NEW WAY: each panel is its own file under js/modules/debug/panels/,
 * named by id (e.g. panels/gravityGrid.json holds exactly the ONE panel
 * object GravityField's panel used to be one entry of). panels/manifest.json
 * is an ordered array of those filenames — order matters (it's the render
 * / MasterGovernor.lockRatios() order), so the manifest is the one place
 * that still has to be touched to add or reorder a panel; the panel's own
 * content never has to compete with anyone else's in the same file again.
 *
 * Mirrors the existing loadPlanetConfigsFromManifest pattern in
 * config-loader.js — same shape, same failure mode (any single panel file
 * failing to load is logged and skipped, not fatal to the rest).
 */

export async function loadPanelConfigs(baseUrl) {
  const manifestRes = await fetch(`${baseUrl}manifest.json`);
  if (!manifestRes.ok) throw new Error(`HTTP ${manifestRes.status} loading panel manifest`);
  const manifest = await manifestRes.json();   // e.g. [ "governor.json", "fps.json", ... ]

  const results = await Promise.all(manifest.map(async (filename) => {
    try {
      const res = await fetch(`${baseUrl}${filename}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cfg = await res.json();
      // THE LAZY LAW (panel-info.js): the description field lives in every
      // panel json but is NEGLECTED at boot — stripped here so no panel
      // object ever holds it. The ℹ second page re-fetches the file and
      // copies out only that scope, the first time it's asked for.
      delete cfg.description;
      return cfg;
    } catch (err) {
      console.warn(`[PanelLoader] Failed to load panel "${filename}":`, err);
      return null;                 // one bad panel file doesn't take down the rest
    }
  }));

  return { panels: results.filter(Boolean) };
}
