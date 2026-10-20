// App shell: menus, settings, main loop. Wires core + render + audio + input.

import { Game } from './core.js';
import { Renderer, drawPreview } from './render.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { THEMES, getTheme } from './themes/index.js';
import { TRACKS } from './music/tracks.js';
import { VERSION, CHANGELOG } from './changelog.js';

const $ = (s, el = document) => el.querySelector(s);
const STORE = 'expanding-tetris.v1';

// ---- settings ----------------------------------------------------------------

const defaults = {
  theme: 'classic',
  music: 'theme',     // 'theme' = whatever the theme suggests, else a track id or 'off'
  musicVol: 0.6,
  sfxVol: 0.7,
  level: 1,
  startWidth: 10,
  best: [],           // [{ score, lines, width, start, name, date }]
  initials: '',
};

function load() {
  // 'sprawl.v1' was the working title; carry its scores over once.
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORE) || localStorage.getItem('sprawl.v1') || '{}') }; }
  catch { return { ...defaults }; }
}
const settings = load();
const save = () => localStorage.setItem(STORE, JSON.stringify(settings));

// ---- objects -------------------------------------------------------------------

const canvas = $('#board');
const renderer = new Renderer(canvas);
const audio = new Audio();
audio.musicVol = settings.musicVol;
audio.sfxVol = settings.sfxVol;

let game = null;
let mode = 'menu';     // menu | playing | paused | over
let theme = null;

// Gestures work anywhere on the game screen, including over the HUD panels
// (they're display-only), so nothing gets in the way in either orientation.
const input = new Input($('#app'), act, () => renderer.cell);

const nextCanvases = [];
for (let i = 0; i < 5; i++) {
  const c = document.createElement('canvas');
  $('#next').appendChild(c);
  nextCanvases.push(c);
}

// ---- theme ---------------------------------------------------------------------

function applyTheme(id) {
  theme = getTheme(id);
  settings.theme = theme.id;
  for (const [k, v] of Object.entries(theme.ui)) document.documentElement.style.setProperty(k, v);
  $('meta[name=theme-color]').setAttribute('content', theme.colors.bg);
  renderer.setTheme(theme);
  canvas.style.imageRendering = theme.pixelated ? 'pixelated' : 'auto';
  drawSide(true);
}

function musicId() {
  return settings.music === 'theme' ? theme.music || 'a' : settings.music;
}

function startMusic() {
  const id = musicId();
  if (id === 'off') audio.stop();
  else if (!audio.track || audio.track.id !== id) audio.play(id);
}

// ---- settings UI (shared by main menu and pause menu) --------------------------

function chips(label, items, current, onPick) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<span class="label">${label}</span><div class="chips"></div>`;
  const box = $('.chips', row);
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = it.name;
    b.setAttribute('aria-pressed', String(it.id === current));
    b.onclick = () => {
      for (const o of box.children) o.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      onPick(it.id);
    };
    box.appendChild(b);
  }
  return row;
}

function slider(label, value, onInput) {
  const row = document.createElement('label');
  row.className = 'slider';
  row.innerHTML = `<span>${label}</span><input type="range" min="0" max="1" step="0.05">`;
  const inp = $('input', row);
  inp.value = value;
  inp.oninput = () => onInput(Number(inp.value));
  return row;
}

function buildSettings(el, { showLevel }) {
  el.innerHTML = '';
  el.appendChild(chips('Theme', THEMES, settings.theme, (id) => {
    applyTheme(id);
    save();
    if (settings.music === 'theme' && mode !== 'menu') startMusic();
  }));
  const trackItems = [
    { id: 'theme', name: 'Theme' },
    ...TRACKS.map((t) => ({ id: t.id, name: `${t.id.toUpperCase()} · ${t.title}` })),
    { id: 'off', name: 'Off' },
  ];
  el.appendChild(chips('Music', trackItems, settings.music, (id) => {
    settings.music = id;
    save();
    audio.unlock();
    // Preview the choice, even from the main menu.
    if (musicId() === 'off') audio.stop();
    else audio.play(musicId());
    if (mode === 'paused') audio.pause();
  }));
  if (showLevel) {
    el.appendChild(chips('Start level', [1, 5, 10, 15].map((n) => ({ id: n, name: String(n) })),
      settings.level, (n) => { settings.level = n; save(); }));
    el.appendChild(chips('Start width', [10, 14, 20, 30].map((n) => ({ id: n, name: String(n) })),
      settings.startWidth, (n) => { settings.startWidth = n; save(); }));
  }
  el.appendChild(slider('Music', settings.musicVol, (v) => { settings.musicVol = v; audio.setMusicVolume(v); save(); }));
  el.appendChild(slider('Effects', settings.sfxVol, (v) => {
    settings.sfxVol = v; audio.setSfxVolume(v); save(); audio.sfx('rotate');
  }));
}

// ---- high scores -------------------------------------------------------------

const RANK = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH', '10TH'];
const pad = (n) => String(n).padStart(6, '0');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let latest = null;   // the entry from the game just played, so it can blink

// An arcade-style table. Empty slots show dashes so the board looks full.
function scoreTable(n, highlight) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const b = settings.best[i];
    const cls = [`r${i + 1}`, b && b === highlight ? 'blink' : ''].join(' ');
    rows.push(b
      ? `<li class="${cls}"><span class="rk">${RANK[i]}</span><span class="nm">${esc(b.name || '???')}</span>` +
        `<span class="sc">${pad(b.score)}</span><span class="mt">L${b.lines} W${b.width}</span></li>`
      : `<li class="${cls} empty"><span class="rk">${RANK[i]}</span><span class="nm">---</span>` +
        `<span class="sc">------</span><span class="mt"></span></li>`);
  }
  return `<div class="hiscores arcade"><div class="hs-title">HIGH SCORES</div><ol>${rows.join('')}</ol></div>`;
}

function renderBest() {
  $('#menu .best').innerHTML = scoreTable(5, latest);
}

// Version under the Settings heading; the changelog opens beneath it.
function renderVersion() {
  const build = $('meta[name=et-build]')?.content;
  const v = $('#settings .version-text');
  v.textContent = `Version ${VERSION}`;
  v.title = build ? `build ${build}` : '';
  $('#settings .changelog').innerHTML = CHANGELOG.map((r) =>
    `<section><h3>${r.version} <span>${r.date}</span></h3><ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>`).join('');
}

function renderCredits() {
  $('#menu .credits').innerHTML = 'Music: ' + TRACKS.map((t) =>
    `${t.id.toUpperCase()} <i>${t.title}</i>, ${t.credit}`).join(' ');
}

// ---- screens -------------------------------------------------------------------

function show(id) {
  for (const s of ['menu', 'pause', 'over', 'settings']) $('#' + s).hidden = s !== id;
}

function openMenu() {
  mode = 'menu';
  input.enabled = false;
  renderBest();
  show('menu');
}

// Settings is its own screen, opened from the main menu or the pause menu,
// and goes back to wherever it came from.
let settingsFrom = 'menu';
function openSettings() {
  settingsFrom = mode === 'paused' ? 'pause' : 'menu';
  buildSettings($('#settings .settings'), { showLevel: settingsFrom === 'menu' });
  show('settings');
}

function newGame() {
  audio.unlock();
  game = new Game({ level: settings.level, width: settings.startWidth });
  renderer.wallAnim = 0;
  renderer.particles.length = 0;
  mode = 'playing';
  input.enabled = true;
  show(null);
  audio.stop();
  audio.setTempo(1);
  startMusic();
  updateHud(true);
}

function pause() {
  if (mode !== 'playing') return;
  mode = 'paused';
  input.enabled = false;
  input.releaseAll();
  audio.pause();
  show('pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'playing';
  input.enabled = true;
  show(null);
  if (musicId() !== 'off') {
    if (audio.track && audio.track.id === musicId()) audio.resume();
    else audio.play(musicId());
  }
  last = performance.now();
}

function gameOver(e) {
  mode = 'over';
  input.enabled = false;
  audio.stop();
  audio.sfx('gameover');
  const entry = {
    score: e.score, lines: e.lines, width: e.width, start: game.startWidth,
    name: settings.initials || 'AAA', date: Date.now(),
  };
  const best = settings.best.concat(entry).sort((a, b) => b.score - a.score).slice(0, 10);
  const rank = best.indexOf(entry);
  const made = rank >= 0 && e.score > 0;
  if (made) settings.best = best;
  latest = made ? entry : null;
  save();

  // Made the table: ask for initials (prefilled with last time's). Typing
  // updates the saved entry as you go, so no extra button is needed.
  const box = $('#over .entry');
  box.hidden = !made;
  const inp = $('#over .initials');
  if (made) {
    $('#over .new-hs').textContent = rank === 0 ? 'NEW HIGH SCORE!' : `${RANK[rank]} PLACE!`;
    inp.value = entry.name;
    inp.oninput = () => {
      inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      entry.name = inp.value || '???';
      settings.initials = inp.value || settings.initials;
      save();
      drawOverTable();
    };
    inp.onkeydown = (ev) => { if (ev.key === 'Enter') inp.blur(); };
  }
  const drawOverTable = () => {
    $('#over .result').innerHTML = `
      <div class="final arcade">
        <div><span>SCORE</span><b>${pad(e.score)}</b></div>
        <div><span>LINES</span><b>${e.lines}</b></div>
        <div><span>LEVEL</span><b>${game.level}</b></div>
        <div><span>WIDTH</span><b>${e.width}</b></div>
      </div>` + (made ? scoreTable(Math.max(5, rank + 1), entry) : '');
  };
  drawOverTable();
  setTimeout(() => {
    if (mode !== 'over') return;
    show('over');
    if (made && matchMedia('(hover: hover)').matches) inp.select();
  }, 900);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  audio.unlock();
  const a = b.dataset.act;
  if (a === 'play' || a === 'restart') newGame();
  else if (a === 'resume') resume();
  else if (a === 'quit') { audio.stop(); openMenu(); }
  else if (a === 'credits') { const c = $('#menu .credits'); c.hidden = !c.hidden; }
  else if (a === 'settings') openSettings();
  else if (a === 'changelog') {
    const c = $('#settings .changelog');
    c.hidden = !c.hidden;
    b.textContent = c.hidden ? "What's new" : 'Hide';
  }
  else if (a === 'settings-done') { show(settingsFrom); if (settingsFrom === 'menu') renderBest(); }
});
$('#pauseBtn').addEventListener('click', () => (mode === 'paused' ? resume() : pause()));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---- input actions -------------------------------------------------------------

function act(a) {
  if (a === 'pause') return mode === 'paused' ? resume() : pause();
  if (a === 'mute') {
    settings.musicVol = settings.musicVol > 0 ? 0 : 0.6;
    audio.setMusicVolume(settings.musicVol);
    save();
    return;
  }
  if (mode !== 'playing' || !game) return;
  switch (a) {
    case 'left': if (game.move(-1)) audio.sfx('move'); break;
    case 'right': if (game.move(1)) audio.sfx('move'); break;
    case 'rotateCW': if (game.rotate(1)) audio.sfx('rotate'); break;
    case 'rotateCCW': if (game.rotate(-1)) audio.sfx('rotate'); break;
    case 'hardDrop': game.hardDrop(); break;
    case 'nudgeLeft': game.move(-1); break;    // silent: undoing flick drift
    case 'nudgeRight': game.move(1); break;
    case 'hold': game.holdPiece(); break;
    case 'softOn': game.setSoftDrop(true); break;
    case 'softOff': game.setSoftDrop(false); break;
    case 'softStep': if (game.active()) game.stepDown(true); break;
  }
}

// ---- HUD -----------------------------------------------------------------------

const hud = { score: $('#score'), level: $('#level'), lines: $('#lines'), width: $('#width') };
let lastHud = '';
let lastSide = '';

function updateHud(force) {
  if (!game) return;
  const key = `${game.score}|${game.level}|${game.lines}|${game.width}`;
  if (force || key !== lastHud) {
    lastHud = key;
    hud.score.textContent = game.score.toLocaleString();
    hud.level.textContent = game.level;
    hud.lines.textContent = game.lines;
    hud.width.textContent = game.width;
  }
  drawSide(force);
}

function drawSide(force) {
  if (!theme) return;
  const q = game ? game.queue.slice(0, 5) : [];
  const key = `${theme.id}|${game?.hold}|${game?.holdUsed}|${q.join('')}`;
  if (!force && key === lastSide) return;
  lastSide = key;
  drawPreview($('#hold'), game?.hold, theme, game?.holdUsed);
  nextCanvases.forEach((c, i) => drawPreview(c, q[i], theme));
}

function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

function handleEvents() {
  for (const e of game.drainEvents()) {
    renderer.onEvent(e, game);
    switch (e.type) {
      case 'lock': audio.sfx('lock'); break;
      case 'harddrop': audio.sfx('harddrop'); navigator.vibrate?.(8); break;
      case 'hold': audio.sfx('hold'); break;
      case 'clear':
        if (e.count >= 4) { audio.sfx('tetris'); navigator.vibrate?.([30, 40, 60]); }
        else audio.sfx('clear', { count: e.count });
        break;
      case 'scored':
        if (e.lines >= 4) toast(e.b2b ? 'BACK-TO-BACK' : 'TETRIS', 'big');
        else if (e.lines === 3) toast('TRIPLE', 'small');
        if (e.combo >= 2) toast(`${e.combo} COMBO`, 'small');
        break;
      case 'expand':
        audio.sfx('expand');
        setTimeout(() => toast(`WIDER · ${e.width}`), 350);
        break;
      case 'levelup':
        audio.sfx('levelup');
        toast(`LEVEL ${e.level}`, 'small');
        break;
      case 'gameover': gameOver(e); break;
    }
  }
}

// Music speeds up with level, and more when the stack nears the top.
function updateTempo() {
  const lvl = 1 + Math.min(0.3, (game.level - 1) * 0.02);
  const danger = game.stackHeight() > game.visible * 0.7 ? 1.12 : 1;
  const t = Math.round(lvl * danger * 100) / 100;
  if (t !== audio.tempo) audio.setTempo(t);
}

// ---- loop ------------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(50, now - last);
  last = now;
  if (game) {
    if (mode === 'playing') {
      input.update(dt);
      game.update(dt);
      handleEvents();
      updateTempo();
      updateHud();
    }
    renderer.draw(game, mode === 'playing' || mode === 'over' ? dt : 0);
  } else {
    renderer.draw(demo, dt);
  }
  requestAnimationFrame(frame);
}

// A static board behind the main menu so the first screen isn't empty.
const demo = new Game({ seed: 7 });
demo.piece = null;
const rows = ['..........', 'T.........', 'TT.....OO.', 'TJJJ.ZZOOL', 'SSIJIIZZLL', 'ISSJILLLSS'];
rows.forEach((r, i) => {
  const y = demo.board.length - rows.length + i;
  [...r].forEach((ch, x) => { demo.board[y][x] = ch === '.' ? null : ch; });
});

window.addEventListener('resize', () => { renderer.resize(); drawSide(true); });
new ResizeObserver(() => { renderer.resize(); drawSide(true); }).observe($('#stage'));

applyTheme(settings.theme);
renderCredits();
renderVersion();
openMenu();
// Reveal the UI once, after the arcade font is ready (or 1 s, whichever is
// first), so the title screen doesn't jump as the font swaps in.
Promise.race([
  document.fonts?.load('12px "Press Start 2P"') ?? Promise.resolve(),
  new Promise((r) => setTimeout(r, 1000)),
]).catch(() => {}).then(() => document.documentElement.classList.add('ready'));
requestAnimationFrame(frame);

// ---- PWA ---------------------------------------------------------------------

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.update();
    // A new build is ready: take it when it won't interrupt a game.
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) sw.postMessage('skip-waiting');
      });
    });
  }).catch(() => {});
  // Only a *new version* replacing an old one needs a reload. On a first
  // visit the worker simply takes control of an already-current page;
  // reloading then just made the title screen flash.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    const reload = () => { reloaded = true; location.reload(); };
    if (mode === 'menu') reload();
    else {
      const iv = setInterval(() => { if (mode === 'menu' || mode === 'over') { clearInterval(iv); reload(); } }, 2000);
    }
  });
}

// For tests and debugging in the console.
window.xt = { get game() { return game; }, renderer, audio, input, settings, newGame };
