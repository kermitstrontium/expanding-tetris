// "Type B" from the 1989 Game Boy game, by Hirokazu Tanaka (Nintendo).
// NOT public domain. A fan rendition for private, personal use only.
// Note data: typeb.data.js, extracted from a fan MIDI transcription.
import { TYPE_B } from './typeb.data.js';
import { decode, drums } from './notation.js';

// The transcription is: 2-bar intro, a 22-bar section, then that section
// again. Beats 8..96 are one pass, which loops seamlessly.
const FROM = 8, TO = 96;
const cut = (s) => decode(s).filter(([b]) => b >= FROM && b < TO).map(([b, d, m]) => [b - FROM, d, m]);
const [lead, harm, bass] = TYPE_B.map(cut);

export default {
  id: 'b',
  title: 'Type B',
  credit: 'Hirokazu Tanaka (Nintendo, 1989). Fan rendition, personal use.',
  bpm: 152,
  len: TO - FROM,
  voices: [
    { wave: 'pulse50', gain: 0.2, notes: lead, gate: 0.75, release: 0.04 },
    { wave: 'pulse25', gain: 0.08, notes: harm, gate: 0.7, release: 0.04 },
    { wave: 'triangle', gain: 0.42, notes: bass, gate: 0.7 },
    { wave: 'drums', gain: 0.12, notes: drums((TO - FROM) / 4) },
  ],
};
