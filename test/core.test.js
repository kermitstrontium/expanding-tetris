// Rules tests. Run: node test/core.test.js
import assert from 'node:assert/strict';
import { Game, SAVE_VERSION, ROWS, HIDDEN, START_WIDTH, TYPES, shapeCells, gravityMs, LOCK_DELAY, CLEAR_DELAY } from '../js/core.js';
import { TRACKS } from '../js/music/tracks.js';
import { THEMES, painterFor } from '../js/themes/index.js';
import { VERSION, CHANGELOG } from '../js/changelog.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error('FAIL', name);
    throw e;
  }
}

function fillRows(g, ys, holeX) {
  for (const y of ys) for (let x = 0; x < g.width; x++) g.board[y][x] = x === holeX ? null : 'Z';
}

// Put an I piece vertical, above column x, and hard-drop it.
function dropVerticalI(g, x) {
  g.piece = { type: 'I', rot: 1, x: 0, y: 0 };
  // rot 1 of I occupies column 2 of its box
  g.piece.x = x - 2;
  g.hardDrop();
}

test('7-bag gives each piece once per 7', () => {
  const g = new Game({ seed: 1 });
  const seen = [g.piece.type, ...g.queue.slice(0, 6)];
  assert.deepEqual([...seen].sort(), [...TYPES].sort());
});

test('rotation shapes have 4 cells and O is stable', () => {
  for (const t of TYPES) for (let r = 0; r < 4; r++) assert.equal(shapeCells(t, r).length, 4);
  const key = (r) => shapeCells('O', r).map(String).sort().join(' ');
  assert.equal(key(0), key(1));
});

test('spawns centred and drops one row', () => {
  const g = new Game({ seed: 2 });
  assert.equal(g.piece.y, 1);
  const g2 = new Game({ seed: 2, width: 12 });
  assert.equal(g2.piece.x, g.piece.x + 1);
});

test('hard drop locks at the floor', () => {
  const g = new Game({ seed: 3 });
  g.piece = { type: 'O', rot: 0, x: 4, y: 1 };
  g.hardDrop();
  assert.equal(g.board[ROWS - 1][4], 'O');
  assert.equal(g.board[ROWS - 2][5], 'O');
});

test('single line clear removes the row and scores', () => {
  const g = new Game({ seed: 4 });
  fillRows(g, [ROWS - 1], 9);
  g.piece = { type: 'I', rot: 1, x: 7, y: 1 };
  g.hardDrop();
  assert.ok(g.clearing);
  g.update(CLEAR_DELAY);
  assert.equal(g.lines, 1);
  assert.equal(g.width, START_WIDTH, 'a single does not widen');
  assert.ok(g.board[ROWS - 1].filter(Boolean).length <= 1);
});

test('TETRIS widens the field by one column each side', () => {
  const g = new Game({ seed: 5 });
  const rows = [ROWS - 4, ROWS - 3, ROWS - 2, ROWS - 1];
  fillRows(g, rows, 9);
  g.board[ROWS - 5][0] = 'T'; // a block above the cleared rows
  dropVerticalI(g, 9);
  g.drainEvents();
  g.update(CLEAR_DELAY);
  const ev = g.drainEvents().map((e) => e.type);
  assert.equal(g.lines, 4);
  assert.equal(g.width, START_WIDTH + 2);
  assert.ok(ev.includes('expand'));
  for (const row of g.board) assert.equal(row.length, START_WIDTH + 2);
  // the surviving block moved down 4 rows and right 1 column
  const bottom = g.rows - 1;
  assert.equal(g.board[bottom][1], 'T');
  assert.equal(g.board[bottom][0], null);
  assert.equal(g.board[bottom][START_WIDTH + 1], null);
  assert.equal(g.visible, 24, '12 wide -> 24 rows');
  // the next piece spawns centred in the new width
  assert.equal(g.piece.x, Math.floor((g.width - (g.piece.type === 'I' ? 4 : g.piece.type === 'O' ? 2 : 3)) / 2));
  assert.equal(g.score, 800 + 2 * (ROWS - 4), '800 for the tetris + 2 per hard-drop row');
});

test('back-to-back tetrises keep widening and score 1.5x', () => {
  const g = new Game({ seed: 6 });
  for (let n = 0; n < 3; n++) {
    const R = g.rows;
    const rows = [R - 4, R - 3, R - 2, R - 1];
    fillRows(g, rows, g.width - 1);
    dropVerticalI(g, g.width - 1);
    g.update(CLEAR_DELAY);
  }
  assert.equal(g.width, START_WIDTH + 6);
  assert.equal(g.tetrises, 3);
  assert.ok(g.score >= 800 + 1200 + 1200);
});

test('widening also adds rows at the top, keeping a 1:2 field', () => {
  const g = new Game({ seed: 13 });
  const R0 = g.rows;
  fillRows(g, [R0 - 4, R0 - 3, R0 - 2, R0 - 1], 9);
  g.board[R0 - 5][3] = 'T';
  dropVerticalI(g, 9);
  g.update(CLEAR_DELAY);
  assert.equal(g.width, 12);
  assert.equal(g.visible, 24);
  assert.equal(g.board.length, g.rows);
  assert.equal(g.rows, 24 + HIDDEN);
  // the surviving block is still on the floor, one column right
  assert.equal(g.board[g.rows - 1][4], 'T');
  // a hard drop now falls the full, taller field
  g.piece = { type: 'O', rot: 0, x: 0, y: 1 };
  g.hardDrop();
  assert.equal(g.board[g.rows - 1][0], 'O');
});

test('a wider start is taller by the same rule', () => {
  const g = new Game({ seed: 15, width: 20 });
  assert.equal(g.visible, 40);
  assert.equal(g.board.length, 42);
  assert.equal(g.board[0].length, 20);
  assert.equal(g.startWidth, 20);
});

test('rows never shrink', () => {
  const g = new Game({ seed: 14 });
  g.growTo(30);
  g.growTo(25);
  assert.equal(g.visible, 30);
  assert.equal(g.board.length, 32);
});

test('pieces can use the new columns', () => {
  const g = new Game({ seed: 7, width: 14 });
  g.piece = { type: 'O', rot: 0, x: 6, y: 1 };
  while (g.move(-1));
  assert.equal(g.piece.x, 0);
  while (g.move(1));
  assert.equal(g.piece.x, 12);
});

test('wall kick lets I rotate against the wall', () => {
  const g = new Game({ seed: 8 });
  g.piece = { type: 'I', rot: 1, x: -2, y: 5 };
  assert.ok(!g.collides(g.piece));
  assert.ok(g.rotate(1));
  assert.ok(!g.collides(g.piece));
});

test('hold swaps once per piece', () => {
  const g = new Game({ seed: 9 });
  const first = g.piece.type;
  assert.ok(g.holdPiece());
  assert.equal(g.hold, first);
  assert.ok(!g.holdPiece());
});

test('lock delay then lock', () => {
  const g = new Game({ seed: 10 });
  g.piece = { type: 'O', rot: 0, x: 4, y: ROWS - 2 };
  g.lockTimer = 0;
  g.update(LOCK_DELAY - 10);
  assert.ok(g.piece && g.piece.type === 'O' && g.piece.y === ROWS - 2);
  g.update(20);
  assert.equal(g.board[ROWS - 1][4], 'O');
});

test('block out ends the game', () => {
  const g = new Game({ seed: 11 });
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < g.width; x++) if (x !== 0) g.board[y][x] = 'Z';
  g.piece = { type: 'O', rot: 0, x: 0, y: ROWS - 2 };
  g.board[ROWS - 1][0] = g.board[ROWS - 2][0] = null;
  g.hardDrop();
  // board is full of near-complete rows; force spawn into blocks
  g.over = false;
  g.clearing = null;
  for (let y = 0; y < HIDDEN + 2; y++) g.board[y].fill('Z');
  g.spawn();
  assert.ok(g.over);
});

test('gravity speeds up with level', () => {
  assert.ok(gravityMs(1) > gravityMs(5));
  assert.ok(gravityMs(5) > gravityMs(15));
});

test('every track has notes and sane lengths', () => {
  assert.ok(TRACKS.length >= 3);
  for (const t of TRACKS) {
    assert.ok(t.bpm > 40 && t.len > 0, t.id);
    for (const v of t.voices) {
      assert.ok(v.notes.length > 0, t.id);
      for (const [b, d, m] of v.notes) {
        assert.ok(b >= 0 && b < t.len && d > 0 && Number.isFinite(m), `${t.id} ${b} ${d} ${m}`);
      }
    }
  }
});

test('every theme has the required keys', () => {
  const ids = new Set();
  for (const th of THEMES) {
    assert.ok(th.id && th.name, 'id/name');
    assert.ok(!ids.has(th.id), 'unique id ' + th.id);
    ids.add(th.id);
    for (const t of TYPES) assert.match(th.pieces[t], /^#[0-9a-f]{6}$/i, `${th.id} piece ${t}`);
    for (const k of ['bg', 'field', 'grid', 'wall', 'wallEdge', 'text', 'accent', 'flash']) {
      assert.ok(th.colors[k], `${th.id} colors.${k}`);
    }
    for (const k of ['--bg', '--panel', '--panel-edge', '--text', '--muted', '--accent', '--font']) {
      assert.ok(th.ui[k], `${th.id} ui ${k}`);
    }
    assert.equal(typeof painterFor(th), 'function');
  }
});

test('changelog: VERSION is the newest entry, versions descend, all dated', () => {
  assert.equal(VERSION, CHANGELOG[0].version);
  const num = (v) => v.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0);
  for (let i = 0; i < CHANGELOG.length; i++) {
    const r = CHANGELOG[i];
    assert.match(r.version, /^\d+\.\d+\.\d+$/);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.notes.length > 0, r.version);
    if (i) assert.ok(num(CHANGELOG[i - 1].version) > num(r.version), `${CHANGELOG[i - 1].version} > ${r.version}`);
  }
});

test('save / restore: a restored game continues identically', () => {
  // Same scripted inputs on the original and on a JSON round-trip copy.
  const play = (g, seed, steps) => {
    let r = seed;
    for (let i = 0; i < steps && !g.over; i++) {
      r = (r * 1103515245 + 12345) >>> 0;
      const k = r % 100;
      if (k < 25) g.move(k < 12 ? -1 : 1);
      else if (k < 40) g.rotate(k < 32 ? 1 : -1);
      else if (k < 44) g.hardDrop();
      else if (k < 45) g.holdPiece();
      g.update(16);
    }
  };
  const a = new Game({ seed: 21 });
  play(a, 1, 400);
  assert.ok(!a.over && a.score > 0, 'still mid-game when saved');
  const saved = JSON.parse(JSON.stringify(a.toJSON()));
  assert.equal(saved.v, SAVE_VERSION);
  const b = Game.fromJSON(saved);
  assert.deepEqual(b.toJSON(), a.toJSON());
  play(a, 2, 5000);
  play(b, 2, 5000);
  assert.deepEqual(b.toJSON(), a.toJSON(), 'diverged after restore');
  assert.equal(b.score, a.score);
  assert.throws(() => Game.fromJSON({ v: 999 }));
});

test('long random play never corrupts the board', () => {
  const g = new Game({ seed: 12 });
  let steps = 0;
  while (!g.over && steps < 20000) {
    const r = g.rand();
    if (r < 0.3) g.move(r < 0.15 ? -1 : 1);
    else if (r < 0.45) g.rotate(r < 0.38 ? 1 : -1);
    else if (r < 0.5) g.hardDrop();
    else if (r < 0.52) g.holdPiece();
    g.update(16);
    assert.equal(g.board.length, g.rows);
    for (const row of g.board) assert.equal(row.length, g.width);
    if (g.piece) assert.ok(!g.collides(g.piece));
    steps++;
  }
  assert.ok(steps > 100);
});

console.log(`core: ${passed} passed`);
