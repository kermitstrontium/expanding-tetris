// Chiptune synth + sequencer + sound effects, all Web Audio. No samples.
//
// Scheduling uses the usual look-ahead pattern: a timer runs every 25 ms and
// queues any notes due in the next ~150 ms on the audio clock. Tempo can
// change at any time (setTempo), which is how the music speeds up with level
// and when the stack gets dangerously high.

import { getTrack } from './music/tracks.js';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const SLICE = 0.25; // beats scheduled per step

const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.6;
    this.sfxVol = 0.7;
    this.track = null;
    this.playing = false;
    this.tempo = 1;
    this.timer = null;
  }

  // Must be called from a user gesture (iOS will not start audio otherwise).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicVol;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVol;
      this.sfxBus.connect(this.master);
      this.waves = {
        pulse50: this.pulse(0.5),
        pulse25: this.pulse(0.25),
        pulse12: this.pulse(0.125),
      };
      this.noise = this.makeNoise();
      // Play a silent buffer: the iOS unlock ritual.
      const b = this.ctx.createBufferSource();
      b.buffer = this.ctx.createBuffer(1, 1, 22050);
      b.connect(this.master);
      b.start(0);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  pulse(duty) {
    const n = 64;
    // Fourier series of a pulse with the given duty cycle (cosine terms).
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return this.ctx.createPeriodicWave(re, im);
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMusicVolume(v) {
    this.musicVol = v;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setSfxVolume(v) {
    this.sfxVol = v;
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  // ---- music -------------------------------------------------------------

  play(id) {
    this.stop();
    const t = getTrack(id);
    if (!t || !this.ctx) return;
    this.track = t;
    this.beat = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.cursors = t.voices.map(() => 0);
    this.playing = true;
    this.voiceOut = this.ctx.createGain();
    this.voiceOut.connect(this.musicBus);
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.voiceOut) {
      const g = this.voiceOut;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      setTimeout(() => g.disconnect(), 300);
      this.voiceOut = null;
    }
    this.track = null;
  }

  // Pause keeps position; resume carries on from there.
  pause() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.voiceOut) this.voiceOut.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }

  resume() {
    if (!this.track || this.playing || !this.ctx) return;
    // Drop anything still queued, restart from the current beat.
    if (this.voiceOut) {
      const old = this.voiceOut;
      old.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      setTimeout(() => old.disconnect(), 200);
    }
    this.voiceOut = this.ctx.createGain();
    this.voiceOut.connect(this.musicBus);
    this.nextTime = this.ctx.currentTime + 0.05;
    this.playing = true;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  setTempo(mult) {
    this.tempo = mult;
  }

  schedule() {
    if (!this.playing || !this.track) return;
    const t = this.track;
    const spb = 60 / (t.bpm * this.tempo);
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    // If the tab was asleep, skip ahead instead of firing a burst.
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.02;
    while (this.nextTime < horizon) {
      const end = this.beat + SLICE;
      t.voices.forEach((v, i) => {
        const notes = v.notes;
        let c = this.cursors[i];
        while (c < notes.length && notes[c][0] < end) {
          const [b, d, m] = notes[c];
          if (b >= this.beat) {
            this.note(v, this.nextTime + (b - this.beat) * spb, d * spb, m);
          }
          c++;
        }
        this.cursors[i] = c;
      });
      this.beat = end;
      this.nextTime += SLICE * spb;
      if (this.beat >= t.len) {
        this.beat = 0;
        this.cursors = t.voices.map(() => 0);
      }
    }
  }

  note(v, when, dur, m) {
    const ctx = this.ctx;
    if (v.wave === 'drums') return this.drum(when, m, v.gain);
    const osc = ctx.createOscillator();
    if (this.waves[v.wave]) osc.setPeriodicWave(this.waves[v.wave]);
    else osc.type = v.wave;
    osc.frequency.value = freq(m + (v.transpose || 0));
    const g = ctx.createGain();
    const len = Math.max(0.03, dur * (v.gate ?? 0.92));
    const rel = v.release ?? 0.04;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(v.gain, when + 0.005);
    g.gain.setTargetAtTime(v.gain * 0.7, when + 0.02, 0.08);
    g.gain.setTargetAtTime(0, when + len, rel / 3);
    osc.connect(g).connect(this.voiceOut);
    osc.start(when);
    osc.stop(when + len + rel + 0.05);
  }

  drum(when, kind, gain) {
    const ctx = this.ctx;
    const out = this.voiceOut;
    if (kind === 0) {
      // kick: falling sine
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, when);
      o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
      g.gain.setValueAtTime(gain * 2.2, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === 1 ? 'bandpass' : 'highpass';
    f.frequency.value = kind === 1 ? 1800 : 7000;
    const g = ctx.createGain();
    const len = kind === 1 ? 0.12 : 0.04;
    g.gain.setValueAtTime(kind === 1 ? gain * 1.4 : gain * 0.5, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + len);
    src.connect(f).connect(g).connect(out);
    src.start(when, Math.random() * 0.5);
    src.stop(when + len + 0.01);
  }

  // ---- sound effects -------------------------------------------------------

  blip(f0, f1, dur, wave = 'pulse25', gain = 0.25, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    if (this.waves[wave]) o.setPeriodicWave(this.waves[wave]);
    else o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(dur, from, to, gain = 0.3, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  sfx(name, data = {}) {
    if (!this.ctx) return;
    switch (name) {
      case 'move': return this.blip(520, 520, 0.03, 'pulse12', 0.08);
      case 'rotate': return this.blip(700, 900, 0.05, 'pulse25', 0.1);
      case 'hold': return this.blip(400, 800, 0.08, 'triangle', 0.25);
      case 'lock': return this.blip(180, 90, 0.08, 'triangle', 0.4);
      case 'harddrop':
        this.blip(260, 60, 0.12, 'triangle', 0.5);
        return this.hiss(0.1, 3000, 400, 0.15);
      case 'clear': {
        const n = data.count || 1;
        for (let i = 0; i < n; i++) this.blip(660 + i * 110, 1320 + i * 220, 0.12, 'pulse25', 0.18, i * 0.05);
        return;
      }
      case 'tetris': {
        const arp = [72, 76, 79, 84, 88, 91, 96];
        arp.forEach((m, i) => this.blip(freq(m), freq(m), 0.12, 'pulse50', 0.16, i * 0.045));
        return;
      }
      case 'expand':
        // The walls slide outward: a rising whoosh and a low thud on each side.
        this.hiss(0.6, 300, 4000, 0.35, 0.1);
        this.blip(110, 55, 0.35, 'triangle', 0.5, 0.35);
        this.blip(freq(84), freq(96), 0.25, 'pulse25', 0.12, 0.45);
        return;
      case 'levelup':
        [76, 79, 83, 88].forEach((m, i) => this.blip(freq(m), freq(m), 0.1, 'pulse25', 0.15, i * 0.07));
        return;
      case 'gameover':
        [69, 65, 62, 57, 50].forEach((m, i) => this.blip(freq(m), freq(m - 1), 0.25, 'pulse50', 0.18, i * 0.18));
        return;
    }
  }
}
