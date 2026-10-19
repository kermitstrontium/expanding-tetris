// Canvas renderer.
//
// World units are cells. The walls sit at column -1 and column `width`.
// The whole field is always visible: when it widens, the view zooms out
// (smoothly) so the field plus both walls fit the screen.

import { HIDDEN, ROWS, VISIBLE, CLEAR_DELAY, LOCK_DELAY, shapeCells } from './core.js';
import { painterFor } from './themes/index.js';

const MIN_COLS = 12;            // never zoom in past a 10-wide field + walls
const WALL_ANIM_MS = 520;
const ROWS_TALL = VISIBLE + 1 + 1 + 0.3;   // peek row + field + floor + gap

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = null;
    this.zoomCols = null;       // columns on screen (walls included), animated
    this.wallAnim = 0;          // 1 -> 0 while the walls slide out
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.t = 0;
    this.resize();
  }

  setTheme(theme) {
    this.theme = theme;
    this.paint = painterFor(theme);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr;
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.layout(this.zoomCols ? this.zoomCols - 2 : 10);
  }

  // Cell size from the (animated) number of columns on screen. The field is
  // centred on its middle column, so when the board grows by a column on
  // each side, existing blocks stay put and only the scale changes.
  layout(width) {
    const cols = Math.max(MIN_COLS, this.zoomCols ?? width + 2);
    this.cell = Math.max(4, Math.floor(Math.min(this.h / ROWS_TALL, this.w / cols)));
    this.cx = Math.round(this.w / 2);
    this.width = width;
    const fieldH = ROWS_TALL * this.cell;
    // Hug the top (under the HUD) once zoomed out; spare room goes below,
    // where thumbs are anyway.
    this.top = Math.round(Math.min((this.h - fieldH) / 2, 8) + this.cell * 0.3);
  }

  // The zoom follows the walls: while they slide out, the visible span is
  // width + 2 - 2 * (slide still to go), so they meet the screen edges just
  // as the slide ends.
  updateZoom(game) {
    this.zoomCols = game.width + 2 - 2 * easeOut(this.wallAnim);
    this.layout(game.width);
  }

  // ---- coordinates -----------------------------------------------------------

  sx(col) { return this.cx + (col - this.width / 2) * this.cell; }
  sy(row) { return this.top + (row - (HIDDEN - 1)) * this.cell; }

  // ---- events from the game --------------------------------------------------

  onEvent(e, game) {
    const c = this.theme.colors;
    switch (e.type) {
      case 'expand':
        // Columns were re-indexed by +1 and the field is centred, so nothing
        // jumps. Slide the walls out while the view zooms out.
        this.wallAnim = 1;
        for (let y = HIDDEN; y <= ROWS; y++) {
          this.burst(-0.5, y + 0.5, c.wallEdge, 3, 0.25);
          this.burst(game.width + 0.5, y + 0.5, c.wallEdge, 3, 0.25);
        }
        this.shake = Math.max(this.shake, 6);
        break;
      case 'harddrop':
        for (const [x, y] of e.cells) this.burst(x + 0.5, y + 1, c.wallEdge, 2, 0.12);
        this.shake = Math.max(this.shake, 2.5);
        break;
      case 'clear': {
        const pieces = this.theme.pieces;
        for (const y of e.rows) {
          for (let x = 0; x < e.width; x++) {
            const t = game.board[y][x];
            if (t && Math.random() < 0.5) this.burst(x + 0.5, y + 0.5, pieces[t], 2, 0.3);
          }
        }
        if (e.count >= 4) {
          this.flash = 0.6;
          this.shake = Math.max(this.shake, 8);
        }
        break;
      }
    }
  }

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.1,
        life: 1, decay: 0.9 + Math.random() * 0.8, color,
        size: 0.08 + Math.random() * 0.12,
      });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  // ---- drawing ---------------------------------------------------------------

  draw(game, dt) {
    const ctx = this.ctx;
    const th = this.theme;
    const col = th.colors;
    const s = this.cell;
    this.t += dt / 1000;

    this.updateZoom(game);
    this.wallAnim = Math.max(0, this.wallAnim - dt / WALL_ANIM_MS);
    const wa = easeOut(this.wallAnim);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (th.background) th.background(ctx, this.w, this.h, this.t);
    else {
      ctx.fillStyle = col.bg;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // Screen shake
    let shx = 0, shy = 0;
    if (this.shake > 0.05) {
      shx = (Math.random() - 0.5) * this.shake;
      shy = (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.002, dt / 1000);
    }
    ctx.save();
    ctx.translate(shx, shy);

    // Viewport clip: everything in the world is drawn inside this box.
    const vpTop = this.sy(HIDDEN - 1);
    const vpBot = this.sy(ROWS + 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, vpTop - 2, this.w, vpBot - vpTop + 4);
    ctx.clip();

    const W = game.width;
    const c0 = -1, c1 = W;

    // Field background + grid
    const fx0 = this.sx(0), fx1 = this.sx(W);
    const fy0 = this.sy(HIDDEN), fy1 = this.sy(ROWS);
    ctx.fillStyle = col.field;
    ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    ctx.strokeStyle = col.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.max(0, c0); x <= Math.min(W, c1); x++) {
      const px = Math.round(this.sx(x)) + 0.5;
      ctx.moveTo(px, fy0); ctx.lineTo(px, fy1);
    }
    for (let y = HIDDEN; y <= ROWS; y++) {
      const py = Math.round(this.sy(y)) + 0.5;
      ctx.moveTo(fx0, py); ctx.lineTo(fx1, py);
    }
    ctx.stroke();

    // New columns fade in while the walls slide.
    if (wa > 0) {
      ctx.fillStyle = col.wall;
      ctx.globalAlpha = wa;
      ctx.fillRect(this.sx(0), fy0, s, fy1 - fy0);
      ctx.fillRect(this.sx(W - 1), fy0, s, fy1 - fy0);
      ctx.globalAlpha = 1;
    }

    // Locked cells
    const clearing = game.clearing;
    const clearP = clearing ? clearing.t / CLEAR_DELAY : 0;
    const opts = { ghost: false, flash: 0, theme: th };
    for (let y = HIDDEN - 1; y < ROWS; y++) {
      const row = game.board[y];
      const isClear = clearing && clearing.rows.includes(y);
      for (let x = Math.max(0, c0); x < Math.min(W, c1 + 1); x++) {
        const t = row[x];
        if (!t) continue;
        if (isClear) {
          // Wipe from the middle outward.
          const d = Math.abs(x + 0.5 - W / 2) / (W / 2);
          if (d < clearP) continue;
          opts.flash = 0.75;
        } else opts.flash = 0;
        this.paint(ctx, this.sx(x), this.sy(y), s, th.pieces[t], opts);
      }
    }
    opts.flash = 0;

    // Ghost + active piece
    const p = game.piece;
    if (p && !game.over) {
      const gy = game.ghostY();
      const color = th.pieces[p.type];
      if (gy !== p.y) {
        opts.ghost = true;
        for (const [cx, cy] of shapeCells(p.type, p.rot)) {
          this.paint(ctx, this.sx(p.x + cx), this.sy(gy + cy), s, color, opts);
        }
        opts.ghost = false;
      }
      // Pieces fade slightly as the lock delay runs out.
      const lockFrac = game.onGround() ? game.lockTimer / LOCK_DELAY : 0;
      ctx.globalAlpha = 1 - lockFrac * 0.35;
      for (const [cx, cy] of shapeCells(p.type, p.rot)) {
        if (p.y + cy < HIDDEN - 1) continue;
        this.paint(ctx, this.sx(p.x + cx), this.sy(p.y + cy), s, color, opts);
      }
      ctx.globalAlpha = 1;
    }

    // Walls and floor (drawn after cells so the slide covers new columns)
    const lw = this.sx(-1 + wa), rw = this.sx(W - wa);
    this.drawWall(lw, fy0, s, fy1 - fy0 + s);
    this.drawWall(rw, fy0, s, fy1 - fy0 + s);
    ctx.fillStyle = col.wall;
    ctx.fillRect(lw, fy1, rw - lw + s, s);
    ctx.fillStyle = col.wallEdge;
    ctx.fillRect(lw + s, fy1, rw - lw - s, Math.max(2, s * 0.12));

    // Particles (world space)
    this.drawParticles(ctx, dt);

    ctx.restore(); // clip

    ctx.restore(); // shake

    if (this.flash > 0.01) {
      ctx.fillStyle = col.flash;
      ctx.globalAlpha = this.flash;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
      this.flash *= Math.pow(0.004, dt / 1000);
    }
  }

  drawWall(x, y, w, h) {
    const ctx = this.ctx, col = this.theme.colors;
    ctx.fillStyle = col.wall;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col.wallEdge;
    const e = Math.max(2, Math.round(w * 0.12));
    ctx.fillRect(x, y, e, h);
    ctx.fillRect(x + w - e, y, e, h);
    // brick seams
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = col.bg;
    for (let i = 0; i * w < h; i++) ctx.fillRect(x, y + i * w, w, 1);
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx, dt) {
    const s = this.cell, k = dt / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += 2.2 * k;
      p.x += p.vx * k * 10;
      p.y += p.vy * k * 10;
      p.life -= p.decay * k;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      const z = p.size * s;
      ctx.fillRect(this.sx(p.x) - z / 2, this.sy(p.y) - z / 2, z, z);
    }
    ctx.globalAlpha = 1;
  }
}

// Small preview canvas for hold / next.
export function drawPreview(canvas, type, theme, dim = false) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(r.width * dpr)) {
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  if (!type) return;
  const cells = shapeCells(type, 0);
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const s = Math.floor(Math.min(r.width / 4.4, r.height / 2.6));
  const ox = (r.width - bw * s) / 2, oy = (r.height - bh * s) / 2;
  const paint = painterFor(theme);
  ctx.globalAlpha = dim ? 0.35 : 1;
  for (const [x, y] of cells) {
    paint(ctx, ox + (x - minX) * s, oy + (y - minY) * s, s, theme.pieces[type], { ghost: false, flash: 0, theme });
  }
  ctx.globalAlpha = 1;
}

function easeOut(t) {
  // t runs 1 -> 0; return how far from "done" we still are, eased.
  return t * t * t;
}
