// Version and changelog, shown under the Settings heading.
//
// With each release: add an entry at the TOP and bump VERSION to match.
// Patch (x.y.Z) for fixes, minor (x.Y.0) for new features or rule changes.
// A test checks VERSION matches the newest entry.

export const CHANGELOG = [
  {
    version: '1.1.0', date: '2026-10-20',
    notes: [
      'Resume later: in the pause menu, saves your game and returns to the title screen. Continue picks it up exactly where you left off, after a short READY... GO.',
      'If the app is closed mid-game, the game is saved automatically and can be continued.',
      'One save at a time; it\'s used up when you continue, so it can\'t be reloaded to undo a mistake.',
    ],
  },
  {
    version: '1.0.0', date: '2026-10-20',
    notes: [
      'Version number and this changelog in Settings.',
      'First release shared with family.',
    ],
  },
  {
    version: '0.7.2', date: '2026-10-20',
    notes: ['A hard-drop flick lands where the piece was when the flick began; sideways drift during the flick no longer moves it.'],
  },
  {
    version: '0.7.1', date: '2026-10-20',
    notes: [
      'Title screen no longer flickers while loading.',
      'Walls extend over the spawn row, so new pieces appear inside the well.',
    ],
  },
  {
    version: '0.7.0', date: '2026-10-20',
    notes: [
      'Settings moved to their own screen.',
      'Arcade-style high scores, with initials for a new high score.',
    ],
  },
  {
    version: '0.6.0', date: '2026-10-20',
    notes: [
      'Start width option (10, 14, 20 or 30).',
      'Title screen tidied: Play first, credits behind a link.',
      'Online at expandingtetris.berger.au.',
    ],
  },
  {
    version: '0.5.0', date: '2026-10-20',
    notes: [
      'Same rules on every device: the field keeps a 1:2 shape as it grows.',
      'Gestures work anywhere on screen, including over the side panels in landscape.',
    ],
  },
  {
    version: '0.4.0', date: '2026-10-20',
    notes: [
      'The field grows taller as it widens.',
      'Speed-sensitive swipes: slow drags are precise, fast swipes cross wide fields.',
    ],
  },
  {
    version: '0.3.0', date: '2026-10-19',
    notes: [
      'The view zooms out to keep the whole field on screen (no more camera panning).',
      'No more text-selection magnifier when dragging on iPhone.',
    ],
  },
  {
    version: '0.2.0', date: '2026-10-19',
    notes: ['Renamed Expanding Tetris.', 'Music B: Type B.'],
  },
  {
    version: '0.1.0', date: '2026-10-19',
    notes: ['First version: every four-line clear widens the field, four themes, chiptune music, installable app.'],
  },
];

export const VERSION = CHANGELOG[0].version;
