// Glowing outlines on black, slow-drifting grid behind the field.
export default {
  id: 'neon',
  name: 'Neon',
  music: 'c',
  cell: 'glow',
  pieces: {
    I: '#00f6ff', J: '#3d7bff', L: '#ff9f1c', O: '#fff04d',
    S: '#39ff88', T: '#d94dff', Z: '#ff3864',
  },
  colors: {
    bg: '#04000c',
    field: 'rgba(10,0,25,0.85)',
    grid: 'rgba(160,80,255,0.10)',
    wall: '#1c0630',
    wallEdge: '#ff2bd6',
    text: '#f2e9ff',
    accent: '#00f6ff',
    flash: '#ffffff',
  },
  ui: {
    '--bg': '#04000c',
    '--panel': '#120527',
    '--panel-edge': '#ff2bd6',
    '--text': '#f2e9ff',
    '--muted': '#a28bc9',
    '--accent': '#00f6ff',
    '--font': "'Segoe UI', system-ui, sans-serif",
  },
  // Optional: draw behind everything. t = seconds since start.
  background(ctx, w, h, t) {
    ctx.fillStyle = '#04000c';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,43,214,0.12)';
    ctx.lineWidth = 1;
    const step = 40;
    const off = (t * 12) % step;
    ctx.beginPath();
    for (let y = -step + off; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    for (let x = 0; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    ctx.stroke();
    ctx.restore();
  },
};
