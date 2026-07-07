/**
 * js/core/color-palette.js
 * Generate and manage color palettes for planets.
 * Each palette has 6 distinct colors based on HSL hue shifts.
 */

export const ColorPalette = {
  // Named palettes (6 colors each, HSL)
  presets: {
    ember: [
      { h: 0,   s: 100, l: 50 },   // Red
      { h: 30,  s: 100, l: 50 },   // Orange
      { h: 60,  s: 100, l: 50 },   // Yellow
      { h: 15,  s: 100, l: 40 },   // Dark Orange
      { h: 0,   s: 100, l: 60 },   // Light Red
      { h: 45,  s: 100, l: 45 }    // Dark Yellow
    ],
    ocean: [
      { h: 200, s: 100, l: 50 },   // Cyan
      { h: 220, s: 100, l: 50 },   // Blue
      { h: 240, s: 100, l: 50 },   // Deep Blue
      { h: 210, s: 100, l: 40 },   // Dark Cyan
      { h: 220, s: 100, l: 60 },   // Light Blue
      { h: 200, s: 100, l: 45 }    // Dark Cyan Alt
    ],
    violet: [
      { h: 270, s: 100, l: 50 },   // Violet
      { h: 280, s: 100, l: 50 },   // Purple
      { h: 260, s: 100, l: 50 },   // Deep Purple
      { h: 270, s: 100, l: 40 },   // Dark Violet
      { h: 280, s: 100, l: 60 },   // Light Purple
      { h: 265, s: 100, l: 45 }    // Dark Purple Alt
    ],
    emerald: [
      { h: 120, s: 100, l: 50 },   // Green
      { h: 140, s: 100, l: 50 },   // Teal Green
      { h: 100, s: 100, l: 50 },   // Lime
      { h: 120, s: 100, l: 40 },   // Dark Green
      { h: 140, s: 100, l: 60 },   // Light Teal
      { h: 110, s: 100, l: 45 }    // Dark Lime
    ],
    magenta: [
      { h: 300, s: 100, l: 50 },   // Magenta
      { h: 320, s: 100, l: 50 },   // Pink
      { h: 330, s: 100, l: 50 },   // Hot Pink
      { h: 300, s: 100, l: 40 },   // Dark Magenta
      { h: 320, s: 100, l: 60 },   // Light Pink
      { h: 310, s: 100, l: 45 }    // Dark Pink Alt
    ],
    gold: [
      { h: 45,  s: 100, l: 50 },   // Gold
      { h: 35,  s: 100, l: 50 },   // Dark Gold
      { h: 55,  s: 100, l: 50 },   // Yellow Gold
      { h: 40,  s: 100, l: 40 },   // Deep Gold
      { h: 50,  s: 100, l: 60 },   // Light Gold
      { h: 45,  s: 100, l: 45 }    // Dim Gold
    ]
  },

  /**
   * Get palette by name.
   */
  getPalette: (name = 'ember') => {
    return ColorPalette.presets[name] || ColorPalette.presets.ember;
  },

  /**
   * Convert HSL to RGB hex string.
   */
  hslToHex: (h, s, l) => {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  },

  /**
   * Get all palette colors as hex strings.
   */
  getPaletteHex: (name = 'ember') => {
    const palette = ColorPalette.getPalette(name);
    return palette.map(hsl => ColorPalette.hslToHex(hsl.h, hsl.s, hsl.l));
  },

  /**
   * Generate a random palette (random hue base, shift 6 colors).
   */
  generateRandom: () => {
    const baseHue = Math.random() * 360;
    const palette = [];
    for (let i = 0; i < 6; i++) {
      palette.push({
        h: (baseHue + i * 60) % 360,
        s: 80 + Math.random() * 20,
        l: 45 + Math.random() * 20
      });
    }
    return palette;
  },

  /**
   * Get all available palette names.
   */
  listPalettes: () => Object.keys(ColorPalette.presets),

  /**
   * Current selected palette (for brush).
   */
  current: 'ember',

  /**
   * Set current palette.
   */
  setCurrent: (name) => {
    if (ColorPalette.presets[name]) {
      ColorPalette.current = name;
      return true;
    }
    return false;
  }
};
