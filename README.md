# Sprawl

A falling-blocks game with one twist: **every four-line clear (a "tetris")
pushes both walls out by one column.** The field starts 10 wide and keeps
growing. Once it's wider than the screen, the camera follows the falling
piece, and a strip at the top shows the whole stack.

Installable PWA, works offline, no build step, no dependencies.

Live (tailnet only): **https://frozen-wsl.tail50be60.ts.net:9447/**
To install on iPhone, open it in Safari, tap Share, then Add to Home Screen.

## Layout

```
index.html, styles.css      shell + menus (colours come from the theme)
js/core.js                  rules: SRS rotation, 7-bag, hold, lock delay,
                            scoring, and expand() (the twist). No DOM.
js/render.js                canvas renderer + camera + minimap + particles
js/input.js                 keyboard (DAS/ARR) and touch gestures
js/audio.js                 Web Audio chiptune synth, sequencer, sound effects
js/main.js                  menus, settings (localStorage), main loop
js/themes/                  one file per theme + index.js registry
js/music/                   one file per tune + tracks.js registry
sw.js                       service worker (network-first, offline fallback)
serve.py                    static server, no-store caching
host/                       systemd unit + install script
tools/                      icon generator, Bach MIDI extractor
test/                       node rules tests + headless browser test
```

## Adding a theme

1. Copy `js/themes/classic.js` to `js/themes/<name>.js`; change `id`, `name`,
   and the colours.
2. Add one `import` line and one array entry in `js/themes/index.js`.
3. Add the file to `ASSETS` in `sw.js` so it works offline.

A theme can choose a block style (`cell: 'flat' | 'bevel' | 'glow' |
'dotmatrix' | 'soft'`) or pass its own paint function (see
`js/themes/painters.js`). It can also supply `background(ctx, w, h, t)`
for an animated backdrop (Neon does this) and a default `music` track.
`test/core.test.js` checks every theme has the keys it needs.

## Adding music

A track is `{ id, title, credit, bpm, len, voices }`. Each voice is
`{ wave, gain, notes }`, and each note is `[beat, beats, midiNote]`. Write
tunes by hand with `seq('E5:1 B4:.5 C5:.5 r:1')` from `js/music/notation.js`
(see `korobeiniki.js`), or generate them from MIDI (see
`tools/extract_bach.py`). Register the track in `js/music/tracks.js`.
Waves: `pulse50`, `pulse25`, `pulse12`, `triangle`, `sawtooth`, `sine`, and
`drums` (note 0 = kick, 1 = snare, 2 = hat).

The music speeds up with level, and again when the stack passes 14 rows.

## Music and licensing

| | Piece | Status |
|---|---|---|
| A | *Korobeiniki*, Russian folk song (1861) | Public domain. Arranged by hand here. |
| B | *Gavotte*, Bach, French Suite No. 3, BWV 814 | Public domain. Stands in for the original "Type B". |
| C | *Menuet & Trio*, Bach, French Suite No. 3, BWV 814 | Public domain. Same movement the Game Boy used. |

The Game Boy's **Type B is not public domain.** Hirokazu Tanaka wrote it for
Nintendo in 1989, so it isn't included.

The Bach note data comes from the Mutopia Project MIDI files. Only the
pitches and timings were taken; those are Bach's.

"Tetris" is a trademark of The Tetris Company, which is why this game is
called something else. It's for personal, tailnet-only use.

## Controls

| Touch | Keys | |
|---|---|---|
| drag sideways | ← → / A D | move |
| tap | ↑ X W | rotate right |
| two-finger tap | Z Ctrl Q | rotate left |
| drag down | ↓ S | soft drop |
| flick down | Space | hard drop |
| flick up | C Shift | hold |
| ❚❚ | Esc P | pause |
| | M | mute music |

## Develop / deploy

```bash
node test/core.test.js                       # rules (16 tests)
python3 serve.py --port 8095 --bind 127.0.0.1 &
NODE_PATH=~/ai-share/endless-game/node_modules node test/browser.test.mjs   # screenshots in shots/
./deploy.sh                                  # tests + stamp build id into sw.js / index.html
bash host/install-service.sh                 # once: systemd unit + tailscale serve :9447
```

The browser test needs Chrome to open sockets, so it can't run inside the
Claude Code bash sandbox.

serve.py reads straight from this folder, so `./deploy.sh` is all a code
change needs. **Always deploy through it.** Installed phones only pick up
new code when the bytes of `sw.js` change, and the stamp is what changes them.

Production chain: `https://frozen-wsl.tail50be60.ts.net:9447` →
`tailscale serve --https=9447` → `127.0.0.1:8091` → `serve.py`
(`sprawl.service`, systemd user unit, `Restart=always`).
