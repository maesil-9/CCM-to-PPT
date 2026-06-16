/** Generates a tasteful, rights-clear gradient background SVG for the demo. */
export function worshipGradientSvg(width = 1920, height = 1080): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2440"/>
      <stop offset="1" stop-color="#0a0e1c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.30" r="0.75">
      <stop offset="0" stop-color="#46588f" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#46588f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
</svg>`;
}
