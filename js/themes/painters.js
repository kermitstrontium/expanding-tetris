// Cell painters a theme can pick by name (`cell: 'bevel'`), or a theme can
// supply its own function with the same signature:
//
//   paint(ctx, x, y, s, color, opts)
//     x, y   top-left in canvas pixels
//     s      cell size in pixels
//     color  the piece colour from theme.pieces
//     opts   { ghost: bool, flash: 0..1, theme }

function shade(hex, amt) {
  // amt -1..1: darken or lighten a #rrggbb colour
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

function ghost(ctx, x, y, s, color, lw = 2) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(x + lw / 2 + 1, y + lw / 2 + 1, s - lw - 2, s - lw - 2);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  ctx.restore();
}

function flashOver(ctx, x, y, s, flash, color = '#fff') {
  if (!flash) return;
  ctx.save();
  ctx.globalAlpha = flash;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, s, s);
  ctx.restore();
}

export const PAINTERS = {
  flat(ctx, x, y, s, color, o) {
    if (o.ghost) return ghost(ctx, x, y, s, color);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    flashOver(ctx, x, y, s, o.flash);
  },

  bevel(ctx, x, y, s, color, o) {
    if (o.ghost) return ghost(ctx, x, y, s, color);
    const b = Math.max(2, Math.round(s * 0.14));
    ctx.fillStyle = color;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = shade(color, 0.45);
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.lineTo(x + s - b, y + b);
    ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + s - b); ctx.lineTo(x, y + s);
    ctx.fill();
    ctx.fillStyle = shade(color, -0.4);
    ctx.beginPath();
    ctx.moveTo(x + s, y + s); ctx.lineTo(x, y + s); ctx.lineTo(x + b, y + s - b);
    ctx.lineTo(x + s - b, y + s - b); ctx.lineTo(x + s - b, y + b); ctx.lineTo(x + s, y);
    ctx.fill();
    flashOver(ctx, x, y, s, o.flash);
  },

  glow(ctx, x, y, s, color, o) {
    ctx.save();
    if (o.ghost) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);
      ctx.restore();
      return;
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = s * 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
    ctx.restore();
    flashOver(ctx, x, y, s, o.flash, color);
  },

  // Original Game Boy style: dark outline, light inner square.
  dotmatrix(ctx, x, y, s, color, o) {
    const pal = o.theme.colors;
    if (o.ghost) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = pal.wall;
      const d = Math.max(2, Math.round(s * 0.18));
      ctx.fillRect(x + s / 2 - d / 2, y + s / 2 - d / 2, d, d);
      ctx.restore();
      return;
    }
    const b = Math.max(1, Math.round(s * 0.1));
    ctx.fillStyle = pal.ink;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = color;
    ctx.fillRect(x + b, y + b, s - 2 * b, s - 2 * b);
    const c = Math.round(s * 0.3);
    ctx.fillStyle = pal.ink;
    ctx.fillRect(x + c, y + c, s - 2 * c, s - 2 * c);
    flashOver(ctx, x, y, s, o.flash, pal.field);
  },

  // Rounded, soft. Good on light backgrounds.
  soft(ctx, x, y, s, color, o) {
    const r = s * 0.22;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, r);
    if (o.ghost) {
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(x + s * 0.2, y + s * 0.15, s * 0.45, s * 0.18, s * 0.09);
      ctx.fill();
    }
    ctx.restore();
    flashOver(ctx, x, y, s, o.flash);
  },
};

export { shade };
