// Keyboard and touch input. Emits abstract actions to `on(action)`:
//   left, right, rotateCW, rotateCCW, hardDrop, hold, pause,
//   softOn, softOff, softStep
//
// Touch gestures (on the playfield):
//   drag sideways      move one column per ~cell of travel
//   drag down          soft drop, one row per ~cell of travel
//   flick down         hard drop
//   flick up           hold
//   tap                rotate clockwise
//   two-finger tap     rotate anticlockwise

const DAS = 150;  // ms before auto-repeat starts
const ARR = 35;   // ms between repeats

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'soft', KeyS: 'soft',
  ArrowUp: 'rotateCW', KeyX: 'rotateCW', KeyW: 'rotateCW',
  KeyZ: 'rotateCCW', ControlLeft: 'rotateCCW', ControlRight: 'rotateCCW', KeyQ: 'rotateCCW',
  Space: 'hardDrop',
  KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
  Escape: 'pause', KeyP: 'pause',
  KeyM: 'mute',
};

export class Input {
  constructor(surface, on, cellSize) {
    this.on = on;
    this.cellSize = cellSize;   // () => current cell size in CSS px
    this.enabled = false;
    this.held = { left: false, right: false };
    this.dir = 0;               // most recent horizontal key held
    this.dasT = 0;
    this.arrT = 0;
    this.pointers = new Map();
    this.gesture = null;

    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.releaseAll());

    surface.addEventListener('pointerdown', (e) => this.down(e));
    surface.addEventListener('pointermove', (e) => this.move(e));
    surface.addEventListener('pointerup', (e) => this.up(e));
    surface.addEventListener('pointercancel', (e) => this.up(e, true));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  releaseAll() {
    this.held.left = this.held.right = false;
    this.dir = 0;
    this.on('softOff');
  }

  key(e, isDown) {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault();
    if (a === 'pause' || a === 'mute') {
      if (isDown && !e.repeat) this.on(a);
      return;
    }
    if (!this.enabled) return;
    if (a === 'left' || a === 'right') {
      this.held[a] = isDown;
      if (isDown && !e.repeat) {
        this.dir = a === 'left' ? -1 : 1;
        this.dasT = 0;
        this.arrT = 0;
        this.on(a);
      } else if (!isDown) {
        // Fall back to the other key if it is still held.
        this.dir = this.held.left ? -1 : this.held.right ? 1 : 0;
        this.dasT = 0;
      }
      return;
    }
    if (a === 'soft') {
      this.on(isDown ? 'softOn' : 'softOff');
      return;
    }
    if (isDown && !e.repeat) this.on(a);
  }

  // Called every frame for DAS/ARR.
  update(dt) {
    if (!this.enabled || !this.dir) return;
    this.dasT += dt;
    if (this.dasT < DAS) return;
    this.arrT += dt;
    while (this.arrT >= ARR) {
      this.arrT -= ARR;
      this.on(this.dir < 0 ? 'left' : 'right');
    }
  }

  // ---- touch ---------------------------------------------------------------

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.gesture) {
      // Second finger: anticlockwise, and the gesture is spent.
      this.gesture.spent = true;
      this.on('rotateCCW');
      return;
    }
    if (this.pointers.size > 1) return;
    this.gesture = {
      id: e.pointerId,
      x0: e.clientX, y0: e.clientY,
      ax: e.clientX, ay: e.clientY,      // anchors for stepping
      t0: performance.now(),
      moved: false, spent: false, axis: null,
      trail: [{ x: e.clientX, y: e.clientY, t: performance.now() }],
    };
  }

  move(e) {
    const g = this.gesture;
    if (!g || e.pointerId !== g.id || g.spent) return;
    e.preventDefault();
    const now = performance.now();
    g.trail.push({ x: e.clientX, y: e.clientY, t: now });
    while (g.trail.length > 2 && now - g.trail[0].t > 90) g.trail.shift();

    const step = this.cellSize() * 0.85;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.axis && Math.hypot(dx, dy) > 10) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (g.axis === 'x') {
      while (e.clientX - g.ax >= step) { g.ax += step; g.moved = true; this.on('right'); }
      while (g.ax - e.clientX >= step) { g.ax -= step; g.moved = true; this.on('left'); }
    } else if (g.axis === 'y') {
      // Allow sideways correction mid-drop once it's clearly intended.
      if (Math.abs(e.clientX - g.ax) > step * 1.5) g.axis = 'x';
      while (e.clientY - g.ay >= step) { g.ay += step; g.moved = true; this.on('softStep'); }
    }
  }

  up(e, cancelled) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g || e.pointerId !== g.id) return;
    this.gesture = null;
    if (cancelled || g.spent || !this.enabled) return;
    const now = performance.now();
    const dt = now - g.t0;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    // Velocity over the last ~90 ms.
    const first = g.trail[0];
    const vt = Math.max(1, now - first.t);
    const vy = (e.clientY - first.y) / vt;   // px per ms
    const vx = (e.clientX - first.x) / vt;
    const cell = this.cellSize();

    if (vy > 1.1 && Math.abs(vy) > Math.abs(vx) * 1.5 && dy > cell) {
      this.on('hardDrop');
    } else if (vy < -0.9 && -dy > cell * 1.5 && Math.abs(dy) > Math.abs(dx)) {
      this.on('hold');
    } else if (!g.moved && dt < 300 && Math.hypot(dx, dy) < 12) {
      this.on('rotateCW');
    }
  }
}
