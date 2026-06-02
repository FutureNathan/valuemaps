// Tiny color helpers. We avoid d3-scale-chromatic to keep the client bundle
// small — a diverging two-hue scale is all the map needs.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

function mix(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  return `#${toHex(a[0] + (b[0] - a[0]) * t)}${toHex(a[1] + (b[1] - a[1]) * t)}${toHex(
    a[2] + (b[2] - a[2]) * t
  )}`;
}

// Desaturated slate for "balanced" regions (the center of every axis).
const NEUTRAL = "#5b6b82";

/**
 * Diverging color for a value in [-100, 100].
 *  v < 0  -> toward leftColor, v = 0 -> neutral, v > 0 -> toward rightColor.
 */
export function divergingColor(value: number, leftColor: string, rightColor: string): string {
  const v = Math.max(-100, Math.min(100, value));
  if (v < 0) return mix(NEUTRAL, leftColor, -v / 100);
  return mix(NEUTRAL, rightColor, v / 100);
}

/** Fill for regions we have no data for. */
export const NO_DATA_COLOR = "#283142";
