// Korobeiniki ("The Peddlers"). Russian folk song, poem by Nikolay Nekrasov
// (1861). Public domain. This arrangement is ours.
import { seq, octaveBass, join } from './notation.js';

const A_LEAD = seq(`
  E5:1 B4:.5 C5:.5 D5:1 C5:.5 B4:.5
  A4:1 A4:.5 C5:.5 E5:1 D5:.5 C5:.5
  B4:1.5 C5:.5 D5:1 E5:1
  C5:1 A4:1 A4:1 r:1
  r:.5 D5:1 F5:.5 A5:1 G5:.5 F5:.5
  E5:1.5 C5:.5 E5:1 D5:.5 C5:.5
  B4:1 B4:.5 C5:.5 D5:1 E5:1
  C5:1 A4:1 A4:1 r:1
`);

// A harmony line a third or sixth under the tune, played quietly.
const A_HARM = seq(`
  G#4:1 G#4:.5 A4:.5 B4:1 A4:.5 G#4:.5
  E4:1 E4:.5 A4:.5 C5:1 B4:.5 A4:.5
  G#4:1.5 A4:.5 B4:1 C5:1
  A4:1 E4:1 E4:1 r:1
  r:.5 F4:1 A4:.5 D5:1 C5:.5 A4:.5
  C5:1.5 G4:.5 C5:1 B4:.5 A4:.5
  G#4:1 G#4:.5 A4:.5 B4:1 C5:1
  A4:1 E4:1 E4:1 r:1
`);

const A_BASS = octaveBass([
  'E2', 'A2', ['G#2', 'E2'], 'A2',
  'D2', 'C2', ['B1', 'E2'], 'A2',
]);

const B_LEAD = seq(`
  E5:2 C5:2 D5:2 B4:2 C5:2 A4:2 G#4:2 B4:2
  E5:2 C5:2 D5:2 B4:2 C5:1 E5:1 A5:2 G#5:4
`);

const B_HARM = seq(`
  C5:2 A4:2 B4:2 G#4:2 A4:2 E4:2 E4:2 G#4:2
  C5:2 A4:2 B4:2 G#4:2 A4:1 C5:1 E5:2 E5:4
`);

const B_BASS = octaveBass([
  'A2', 'G#2', 'A2', 'E2', 'A2', 'G#2', 'A2', 'E2',
]);

// Snare-ish noise on 2 and 4, kick on 1 and 3. midi field = drum id.
function drums(bars) {
  const out = [];
  for (let b = 0; b < bars; b++) {
    out.push([b * 4, 0.25, 0], [b * 4 + 1, 0.25, 1], [b * 4 + 2, 0.25, 0], [b * 4 + 3, 0.25, 1]);
    for (let e = 0; e < 8; e++) out.push([b * 4 + e / 2 + 0.25, 0.1, 2]);
  }
  return out;
}

const A = { len: 32, voices: [A_LEAD, A_HARM, A_BASS, drums(8)] };
const B = { len: 32, voices: [B_LEAD, B_HARM, B_BASS, drums(8)] };
const song = join([A, A, B, B]);

export default {
  id: 'a',
  title: 'Korobeiniki',
  credit: 'Russian folk song (1861). Public domain.',
  bpm: 150,
  len: song.len,
  voices: [
    { wave: 'pulse50', gain: 0.22, notes: song.voices[0], release: 0.06 },
    { wave: 'pulse25', gain: 0.07, notes: song.voices[1], release: 0.05 },
    { wave: 'triangle', gain: 0.42, notes: song.voices[2], gate: 0.8 },
    { wave: 'drums', gain: 0.16, notes: song.voices[3] },
  ],
};
