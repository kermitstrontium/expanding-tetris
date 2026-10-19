#!/usr/bin/env python3
"""Draw the app icons (PNG + SVG) with no dependencies.

The motif: a stack of blocks that widens toward the bottom, with the walls
pushed out. Run from the repo root: python3 tools/make_icons.py
"""
import os, struct, zlib

BG = (11, 14, 26)
WALL = (93, 103, 136)
COLS = {'I': (33, 212, 230), 'J': (47, 98, 232), 'L': (242, 154, 29), 'O': (245, 211, 39),
        'S': (63, 207, 74), 'T': (166, 69, 224), 'Z': (232, 57, 61)}
# 10 x 10 grid of cells inside the safe zone; '.' empty, '#' wall.
ART = [
    '..........',
    '....TTT...',
    '.....T....',
    '...LOOZZ..',
    '...LOOJZZ.',
    '..LLIIIIJ.',
    '..SSJJJIJJ',
    '.SSOOTTTZZ',
    '#IIOOJTLLZ#',
    '###########',
]


def grid():
    rows = [r.ljust(11, '.') for r in ART]
    return rows


def shade(c, a):
    t = 0 if a < 0 else 255
    a = abs(a)
    return tuple(round((t - v) * a + v) for v in c)


def render(size, maskable=False):
    px = [[BG] * size for _ in range(size)]
    rows = grid()
    pad = size * (0.2 if maskable else 0.1)
    cell = (size - 2 * pad) / 11
    for gy, r in enumerate(rows):
        for gx, ch in enumerate(r):
            if ch == '.':
                continue
            col = WALL if ch == '#' else COLS[ch]
            x0 = pad + gx * cell
            y0 = pad + gy * cell + cell * 0.5
            b = max(1, cell * 0.14)
            for y in range(int(y0), int(y0 + cell)):
                for x in range(int(x0), int(x0 + cell)):
                    if not (0 <= x < size and 0 <= y < size):
                        continue
                    lx, ly = x - x0, y - y0
                    c = col
                    if lx < b or ly < b:
                        c = shade(col, 0.4)
                    if lx > cell - b or ly > cell - b:
                        c = shade(col, -0.4)
                    px[y][x] = c
    return px


def png(path, px):
    h, w = len(px), len(px[0])
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in px)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    open(path, 'wb').write(data)


def svg(path):
    rows = grid()
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 120">',
           '<rect width="110" height="120" rx="18" fill="#0b0e1a"/>']
    for gy, r in enumerate(rows):
        for gx, ch in enumerate(r):
            if ch == '.':
                continue
            c = WALL if ch == '#' else COLS[ch]
            out.append('<rect x="%d" y="%d" width="9.4" height="9.4" rx="1.5" fill="#%02x%02x%02x"/>'
                       % (gx * 10 + 0.3, gy * 10 + 10, *c))
    out.append('</svg>')
    open(path, 'w').write('\n'.join(out))


os.makedirs('icons', exist_ok=True)
png('icons/icon-192.png', render(192))
png('icons/icon-512.png', render(512))
png('icons/icon-maskable-512.png', render(512, maskable=True))
png('icons/apple-touch-icon.png', render(180))
svg('icons/icon.svg')
print('icons written')
