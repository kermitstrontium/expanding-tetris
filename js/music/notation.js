// Tiny helpers for writing tunes by hand.
//
//   seq('E5:1 B4:.5 C5:.5 r:1')  -> [[beat, dur, midi], ...]
//
// Each token is NOTE:BEATS (quarter note = 1 beat). `r` is a rest. Notes
// are laid end to end starting at `start`.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function seq(str, start = 0) {
  const out = [];
  let t = start;
  for (const tok of str.trim().split(/\s+/)) {
    const [n, d] = tok.split(':');
    const dur = Number(d);
    if (n !== 'r') out.push([t, dur, midi(n)]);
    t += dur;
  }
  return out;
}

// Decode the "beat:dur:midi beat:dur:midi" strings used by generated data.
export function decode(str) {
  return str.trim().split(/\s+/).map((t) => t.split(':').map(Number));
}

// Concatenate sections; each section is { len, voices: [notes...] }.
export function join(sections) {
  const voices = [];
  let off = 0;
  for (const s of sections) {
    s.voices.forEach((notes, i) => {
      voices[i] = voices[i] || [];
      for (const [b, d, m] of notes) voices[i].push([b + off, d, m]);
    });
    off += s.len;
  }
  return { len: off, voices };
}

// Octave-bouncing bass: one root per bar, eighth notes low/high.
export function octaveBass(roots, beatsPerBar = 4) {
  const out = [];
  roots.forEach((r, bar) => {
    const parts = Array.isArray(r) ? r : [r];
    const span = beatsPerBar / parts.length;
    parts.forEach((p, k) => {
      const lo = midi(p);
      for (let e = 0; e < span * 2; e++) {
        out.push([bar * beatsPerBar + k * span + e / 2, 0.5, e % 2 ? lo + 12 : lo]);
      }
    });
  });
  return out;
}
