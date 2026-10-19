// J. S. Bach, French Suite No. 3 in B minor, BWV 814. Public domain.
// Note data in bach.js is generated from the Mutopia Project MIDI.
import { BACH } from './bach.js';
import { decode, join } from './notation.js';

const mv = (k) => {
  const voices = BACH[k].map(decode);
  const len = Math.max(...voices.flat().map(([b, d]) => b + d));
  return { len: Math.ceil(len), voices };
};

// Minuet, Trio, Minuet da capo: the "C" music.
const menuet = mv('menuet');
const trio = mv('trio');
const c = join([menuet, trio, menuet]);

export const typeC = {
  id: 'c',
  title: 'Menuet & Trio',
  credit: 'J. S. Bach, French Suite No. 3, BWV 814. Public domain.',
  bpm: 150,
  len: c.len,
  voices: [
    { wave: 'pulse50', gain: 0.2, notes: c.voices[0], release: 0.05 },
    { wave: 'triangle', gain: 0.4, notes: c.voices[1], gate: 0.85 },
  ],
};

// Gavotte from the same suite: a bonus track.
const g = mv('gavotte');

export const gavotte = {
  id: 'd',
  title: 'Gavotte',
  credit: 'J. S. Bach, French Suite No. 3, BWV 814. Public domain.',
  bpm: 176,
  len: g.len,
  voices: [
    { wave: 'pulse25', gain: 0.2, notes: g.voices[0], release: 0.05 },
    { wave: 'triangle', gain: 0.4, notes: g.voices[1], gate: 0.85 },
  ],
};
