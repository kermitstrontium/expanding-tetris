// The 1989 handheld: four shades of pea green, every piece the same ink.
const SHADES = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];

export default {
  id: 'gameboy',
  name: 'Pocket',
  music: 'a',
  cell: 'dotmatrix',
  pieces: {
    I: SHADES[2], J: SHADES[1], L: SHADES[2], O: SHADES[1],
    S: SHADES[2], T: SHADES[1], Z: SHADES[2],
  },
  colors: {
    bg: SHADES[3],
    field: SHADES[3],
    grid: 'rgba(15,56,15,0.08)',
    wall: SHADES[1],
    wallEdge: SHADES[0],
    ink: SHADES[0],
    text: SHADES[0],
    accent: SHADES[0],
    flash: SHADES[3],
  },
  ui: {
    '--bg': SHADES[3],
    '--panel': '#8bac0f',
    '--panel-edge': SHADES[1],
    '--text': SHADES[0],
    '--muted': SHADES[1],
    '--accent': SHADES[0],
    '--font': "'Courier New', ui-monospace, monospace",
  },
  // Square pixels, no smoothing, matches the dot-matrix look.
  pixelated: true,
};
