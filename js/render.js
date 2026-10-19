// Canvas renderer. Owns the camera.
//
// World units are cells. The walls sit at column -1 and column `width`. The
// viewport shows at most MAX_VIEW_COLS columns (walls included). While the
// whole field fits it is centred; once it doesn't, the camera pans to keep
// the falling piece away from the viewport edges (a dead-zone follow).

import { HIDDEN, ROWS, VISIBLE, CLEAR_DELAY, LOCK_DELAY, shapeCells, shapeSize } from './core.js';
import { painterFor } from './themes/index.js';

export const MAX_VIEW_COLS = 16;
const MIN_VIEW_COLS = 12;       // a 10-wide field plus two walls always fits
const CAM_RATE = 9;             // higher = snappier camera
const WALL_ANIM_MS = 520;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = null;
    this.camX = null;
    this.camTarget = null;
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

    // Vertical budget: minimap strip + one peek row above the field + the
    // visible rows + the floor.
    const mmFrac = 0.45;
    const rowsTall = VISIBLE + 1 + 1 + mmFrac + 0.4;
    this.cell = Math.max(8, Math.floor(Math.min(this.h / rowsTall, this.w / MIN_VIEW_COLS)));
    this.viewCols = Math.max(MIN_VIEW_COLS, Math.min(MAX_VIEW_COLS, Math.floor(this.w / this.cell)));
    this.vpW = this.viewCols * this.cell;
    this.x0 = Math.floor((this.w - this.vpW) / 2);
    this.mmH = Math.max(6, Math.round(this.cell * mmFrac));
    const usedH = (VISIBLE + 2) * this.cell + this.mmH + Math.round(this.cell * 0.4);
    this.yMm = Math.max(0, Math.floor((this.h - usedH) / 2));
    this.top = this.yMm + this.mmH + Math.round(this.cell * 0.4); // top of the peek row
  }

  // ---- coordinates -----------------------------------------------------------

  sx(col) { return this.x0 + (col - this.camX) * this.cell; }
  sy(row) { return this.top + (row - (HIDDEN - 1)) * this.cell; }

  // ---- camera ----------------------------------------------------------------

  centredCam(width) {
    return -1 - (this.viewCols - (width + 2)) / 2;
  }

  updateCamera(game, dt) {
    const W = game.width;
    const V = this.viewCols;
    let target;
    if (W + 2 <= V) {
      target = this.centredCam(W);
    } else {
      target = this.camTarget ?? this.centredCam(W);
      const p = game.piece;
      if (p) {
        const cells = shapeCells(p.type, p.rot);
        const left = p.x + Math.min(...cells.map((c) => c[0]));
        const right = p.x + Math.max(...cells.map((c) => c[0])) + 1;
        const margin = Math.min(4, Math.floor(V * 0.28));
        if (left < target + margin) target = left - margin;
        if (right > target + V - margin) target = right - V + margin;
      }
      target = Math.max(-1, Math.min(W + 1 - V, target));
    }
    this.camTarget = target;
    if (this.camX === null) this.camX = target;
    const k = 1 - Math.exp(-CAM_RATE * dt / 1000);
    this.camX += (target - this.camX) * k;
    if (Math.abs(target - this.camX) < 0.001) this.camX = target;
  }

  // ---- events from the game --------------------------------------------------

  onEvent(e, game) {
    const c = this.theme.colors;
    switch (e.type) {
      case 'expand':
        // Columns were re-indexed by +1. Shift the camera the same amount so
        // nothing jumps, then animate the walls sliding outward.
        if (this.camX !== null) this.camX += 1;
        if (this.camTarget !== null) this.camTarget += 1;
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

    this.updateCamera(game, dt);
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
    ctx.rect(this.x0, vpTop - 2, this.vpW, vpBot - vpTop + 4);
    ctx.clip();

    const W = game.width;
    const c0 = Math.max(-1, Math.floor(this.camX) - 1);
    const c1 = Math.min(W, Math.ceil(this.camX + this.viewCols) + 1);

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
      ctx.moveTo(Math.max(fx0, this.x0), py); ctx.lineTo(Math.min(fx1, this.x0 + this.vpW), py);
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

    // Edge fades hint that the field continues off-screen.
    if (W + 2 > this.viewCols) {
      const fw = s * 1.2;
      if (this.camX > -1 + 0.05) this.edgeFade(this.x0, vpTop, fw, vpBot - vpTop, 1);
      if (this.camX + this.viewCols < W + 1 - 0.05) {
        this.edgeFade(this.x0 + this.vpW - fw, vpTop, fw, vpBot - vpTop, -1);
      }
    }
    ctx.restore(); // clip

    this.drawMinimap(game);
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

  edgeFade(x, y, w, h, dir) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(dir > 0 ? x : x + w, 0, dir > 0 ? x + w : x, 0);
    g.addColorStop(0, hexA(this.theme.colors.bg, 0.85));
    g.addColorStop(1, hexA(this.theme.colors.bg, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
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

  // The whole field squashed into a strip, with the viewport marked. Only
  // shown once the field is wider than the screen.
  drawMinimap(game) {
    const W = game.width;
    if (W + 2 <= this.viewCols && this.wallAnim === 0) return;
    const ctx = this.ctx, col = this.theme.colors;
    const x = this.x0, y = this.yMm, w = this.vpW, h = this.mmH;
    const cw = w / (W + 2);
    ctx.fillStyle = hexA(col.text, 0.08);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hexA(col.text, 0.55);
    for (let c = 0; c < W; c++) {
      let top = ROWS;
      for (let r = 0; r < ROWS; r++) if (game.board[r][c]) { top = r; break; }
      const hgt = ((ROWS - top) / VISIBLE) * h;
      if (hgt > 0) ctx.fillRect(x + (c + 1) * cw, y + h - hgt, Math.max(1, cw - 0.5), hgt);
    }
    if (game.piece) {
      const n = shapeSize(game.piece.type);
      ctx.fillStyle = this.theme.pieces[game.piece.type];
      ctx.fillRect(x + (game.piece.x + 1) * cw, y, n * cw, Math.max(2, h * 0.25));
    }
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + (this.camX + 1) * cw + 0.75, y + 0.75, this.viewCols * cw - 1.5, h - 1.5);
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

function hexA(color, a) {
  if (color.startsWith('#') && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color;
}
