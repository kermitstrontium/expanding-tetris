// Music registry. A track is:
//   { id, title, credit, bpm, len (beats), voices: [{ wave, gain, notes,
//     gate?, release?, transpose? }] }
// notes are [beat, durationBeats, midi]. wave is pulse50 | pulse25 |
// pulse12 | triangle | sawtooth | sine | drums (midi 0 kick, 1 snare, 2 hat).
import korobeiniki from './korobeiniki.js';
import { typeB, typeC } from './bach.tracks.js';

export const TRACKS = [korobeiniki, typeB, typeC];

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) || null;
}
