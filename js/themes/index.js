// Theme registry.
//
// To add a theme: copy classic.js to mytheme.js, change the id, name and
// colours, then add one import and one array entry below. That's it.
//
// Required keys: id, name, pieces{I,J,L,O,S,T,Z}, colors{bg, field, grid,
// wall, wallEdge, text, accent, flash}, ui{CSS custom properties}.
// Optional: cell ('flat'|'bevel'|'glow'|'dotmatrix'|'soft' or a function, see
// painters.js), music ('a'|'b'|'c'|'off'), background(ctx, w, h, t),
// pixelated (bool).
import classic from './classic.js';
import gameboy from './gameboy.js';
import neon from './neon.js';
import paper from './paper.js';
import { PAINTERS } from './painters.js';

export const THEMES = [classic, gameboy, neon, paper];

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function painterFor(theme) {
  if (typeof theme.cell === 'function') return theme.cell;
  return PAINTERS[theme.cell] || PAINTERS.flat;
}
