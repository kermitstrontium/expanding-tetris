// Expanding Tetris: game rules. Pure logic, no DOM, so it runs under Node for tests.
//
// The twist: clearing four lines at once (a "tetris") adds one empty column
// to each side of the field. The field never shrinks.
//
// It grows taller too: each widening adds empty rows at the top so the
// field keeps the classic 1:2 shape (width 12 -> 24 rows, 34 -> 68). The
// rule is fixed, never screen-dependent, so every device plays the same
// game.
//
// Coordinates: x = column (0 = leftmost), y = row (0 = top). The board has
// HIDDEN rows above the visible ones; pieces spawn in the hidden rows.
// game.rows / game.visible are the current sizes; ROWS / VISIBLE below are
// only the starting sizes.

export const VISIBLE = 20;
export const HIDDEN = 2;
export const ROWS = VISIBLE + HIDDEN;
export const START_WIDTH = 10;
export const MAX_WIDTH = 200;          // sanity cap; nobody gets here
export const ROWS_PER_COL = 2;
export const MAX_VISIBLE = ROWS_PER_COL * MAX_WIDTH;
export const LINES_PER_LEVEL = 10;
export const LOCK_DELAY = 500;         // ms on the ground before locking
export const LOCK_RESETS = 15;         // moves/rotations that refresh it
export const CLEAR_DELAY = 280;        // ms the cleared rows flash
export const SOFT_DROP_FACTOR = 20;

export const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

// Spawn orientation, y down. Box size is the rotation box.
const SHAPES = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

// SHAPE_ROT[type][rot] = cells. Clockwise rotation in a box of size n with
// y down: (x, y) -> (n - 1 - y, x).
const SHAPE_ROT = {};
for (const t of TYPES) {
  const { n, cells } = SHAPES[t];
  const rots = [cells];
  for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [n - 1 - y, x]));
  SHAPE_ROT[t] = rots;
}

export function shapeCells(type, rot = 0) {
  return SHAPE_ROT[type][rot & 3];
}

export function shapeSize(type) {
  return SHAPES[type].n;
}

// SRS wall kicks, from the guideline tables. Written y-up as in the tables,
// flipped to y-down when used.
const KICK_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// Points per lines cleared at once, times level.
const LINE_SCORE = [0, 100, 300, 500, 800];

export function gravityMs(level) {
  // Guideline curve, capped at level 20.
  const l = Math.min(Math.max(level, 1), 20);
  return 1000 * Math.pow(0.8 - (l - 1) * 0.007, l - 1);
}

// Small seeded PRNG so tests (and replays, one day) are deterministic.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor(opts = {}) {
    this.width = opts.width ?? START_WIDTH;
    this.startLevel = opts.level ?? 1;
    this.visible = VISIBLE;
    this.grow = opts.grow ?? true;         // tests can turn height growth off
    this.rand = mulberry32(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.board = [];
    for (let y = 0; y < this.rows; y++) this.board.push(new Array(this.width).fill(null));
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.holdUsed = false;
    this.piece = null;
    this.score = 0;
    this.lines = 0;
    this.tetrises = 0;
    this.expansions = 0;
    this.combo = -1;
    this.backToBack = false;
    this.over = false;
    this.softDropping = false;
    this.clearing = null;    // { rows, t } while cleared rows flash
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = 0;
    this.time = 0;
    this.events = [];
    this.refillQueue();
    this.spawn();
  }

  get rows() {
    return this.visible + HIDDEN;
  }

  get level() {
    return this.startLevel + Math.floor(this.lines / LINES_PER_LEVEL);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  refillQueue() {
    while (this.queue.length < 7) {
      if (!this.bag.length) {
        this.bag = TYPES.slice();
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rand() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  spawnX(type) {
    return Math.floor((this.width - shapeSize(type)) / 2);
  }

  spawn(type) {
    if (!type) {
      type = this.queue.shift();
      this.refillQueue();
    }
    this.piece = { type, rot: 0, x: this.spawnX(type), y: 0 };
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (this.collides(this.piece)) {
      this.gameOver('block out');
      return;
    }
    // Guideline: drop one row straight away if there is room.
    if (!this.collides(this.piece, 0, 1)) this.piece.y += 1;
    this.lowestY = this.piece.y;
    this.emit('spawn', { type });
  }

  cells(p = this.piece, dx = 0, dy = 0, rot = p.rot) {
    return shapeCells(p.type, rot).map(([cx, cy]) => [p.x + cx + dx, p.y + cy + dy]);
  }

  collides(p, dx = 0, dy = 0, rot = p.rot) {
    for (const [x, y] of this.cells(p, dx, dy, rot)) {
      if (x < 0 || x >= this.width || y >= this.rows) return true;
      if (y >= 0 && this.board[y][x]) return true;
    }
    return false;
  }

  onGround() {
    return this.piece && this.collides(this.piece, 0, 1);
  }

  ghostY() {
    if (!this.piece) return 0;
    let d = 0;
    while (!this.collides(this.piece, 0, d + 1)) d++;
    return this.piece.y + d;
  }

  active() {
    return !this.over && this.piece && !this.clearing;
  }

  // A successful move or rotation while grounded refreshes the lock delay, up
  // to LOCK_RESETS times per piece (stops infinite spinning).
  touched() {
    if (this.lockResets < LOCK_RESETS && this.onGround()) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    if (!this.active()) return false;
    if (this.collides(this.piece, dx, 0)) return false;
    this.piece.x += dx;
    this.touched();
    this.emit('move', { dx });
    return true;
  }

  rotate(dir) {
    if (!this.active()) return false;
    const p = this.piece;
    if (p.type === 'O') return false;
    const from = p.rot;
    const to = (from + (dir > 0 ? 1 : 3)) & 3;
    const table = p.type === 'I' ? KICK_I : KICK_JLSTZ;
    for (const [kx, ky] of table[from + '>' + to]) {
      if (!this.collides(p, kx, -ky, to)) {
        p.x += kx;
        p.y -= ky;
        p.rot = to;
        this.touched();
        this.emit('rotate', { dir });
        return true;
      }
    }
    return false;
  }

  setSoftDrop(on) {
    this.softDropping = !!on;
  }

  // One step down. Returns false if blocked.
  stepDown(scored) {
    if (this.collides(this.piece, 0, 1)) return false;
    this.piece.y++;
    if (scored) this.score += 1;
    if (this.piece.y > this.lowestY) {
      this.lowestY = this.piece.y;
      this.lockTimer = 0;
      this.lockResets = 0;
    }
    return true;
  }

  hardDrop() {
    if (!this.active()) return false;
    let n = 0;
    while (!this.collides(this.piece, 0, 1)) {
      this.piece.y++;
      n++;
    }
    this.score += 2 * n;
    this.emit('harddrop', { rows: n, cells: this.cells() });
    this.lock();
    return true;
  }

  holdPiece() {
    if (!this.active() || this.holdUsed) return false;
    const cur = this.piece.type;
    const swap = this.hold;
    this.hold = cur;
    this.holdUsed = true;
    this.emit('hold', { type: cur });
    this.spawn(swap || undefined);
    return true;
  }

  lock() {
    const cells = this.cells();
    let allHidden = true;
    for (const [x, y] of cells) {
      if (y >= 0) this.board[y][x] = this.piece.type;
      if (y >= HIDDEN) allHidden = false;
    }
    this.emit('lock', { type: this.piece.type, cells });
    this.piece = null;
    this.holdUsed = false;
    if (allHidden) {
      this.gameOver('lock out');
      return;
    }
    const full = [];
    for (let y = 0; y < this.rows; y++) if (this.board[y].every(Boolean)) full.push(y);
    if (full.length) {
      this.clearing = { rows: full, t: 0 };
      this.emit('clear', { rows: full, count: full.length, width: this.width });
    } else {
      this.combo = -1;
      this.spawn();
    }
  }

  finishClear() {
    const rows = this.clearing.rows;
    const n = rows.length;
    this.clearing = null;
    const keep = this.board.filter((_, y) => !rows.includes(y));
    while (keep.length < this.rows) keep.unshift(new Array(this.width).fill(null));
    this.board = keep;

    const before = this.level;
    const isTetris = n >= 4;
    let pts = LINE_SCORE[Math.min(n, 4)] * before;
    if (isTetris && this.backToBack) pts = Math.floor(pts * 1.5);
    this.backToBack = isTetris;
    this.combo++;
    if (this.combo > 0) pts += 50 * this.combo * before;
    this.score += pts;
    this.lines += n;
    this.emit('scored', { lines: n, points: pts, combo: this.combo, b2b: isTetris && this.backToBack });
    if (this.level > before) this.emit('levelup', { level: this.level });

    if (isTetris) {
      this.tetrises++;
      this.expand();
    }
    this.spawn();
  }

  // THE TWIST. One empty column on each side.
  expand() {
    if (this.width + 2 > MAX_WIDTH) return;
    for (const row of this.board) {
      row.unshift(null);
      row.push(null);
    }
    this.width += 2;
    this.expansions++;
    const prevVisible = this.visible;
    if (this.grow) this.growTo(this.width * ROWS_PER_COL);
    this.emit('expand', { width: this.width, visible: this.visible, prevVisible });
  }

  // Add empty rows at the top until `visible` rows are showing. Never
  // shrinks, so nothing on the board is ever lost.
  growTo(visible) {
    const target = Math.min(MAX_VISIBLE, Math.floor(visible));
    while (this.visible < target) {
      this.board.unshift(new Array(this.width).fill(null));
      this.visible++;
    }
  }

  gameOver(reason) {
    this.over = true;
    this.piece = null;
    this.emit('gameover', { reason, score: this.score, lines: this.lines, width: this.width });
  }

  // Height of the stack in rows (0 = empty). Used for the "danger" music.
  stackHeight() {
    for (let y = 0; y < this.rows; y++) if (this.board[y].some(Boolean)) return this.rows - y;
    return 0;
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    if (this.clearing) {
      this.clearing.t += dt;
      if (this.clearing.t >= CLEAR_DELAY) this.finishClear();
      return;
    }
    if (!this.piece) return;

    const g = gravityMs(this.level);
    const interval = this.softDropping ? Math.min(g, g / SOFT_DROP_FACTOR) : g;
    this.gravAcc += dt;
    while (this.gravAcc >= interval) {
      this.gravAcc -= interval;
      if (!this.stepDown(this.softDropping)) {
        this.gravAcc = 0;
        break;
      }
    }

    if (this.onGround()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }
}
