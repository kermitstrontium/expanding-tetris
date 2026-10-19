// Light mode: soft rounded pastel blocks on paper.
export default {
  id: 'paper',
  name: 'Paper',
  music: 'c',
  cell: 'soft',
  pieces: {
    I: '#5ec8d8', J: '#6f8fe0', L: '#f0a35e', O: '#f2cf5b',
    S: '#7ccf86', T: '#b48ad9', Z: '#ee7b7b',
  },
  colors: {
    bg: '#f4efe6',
    field: '#fffdf8',
    grid: 'rgba(60,40,20,0.06)',
    wall: '#d9cfbf',
    wallEdge: '#b8ab96',
    text: '#3b3328',
    accent: '#e0794f',
    flash: '#ffffff',
  },
  ui: {
    '--bg': '#f4efe6',
    '--panel': '#fffdf8',
    '--panel-edge': '#d9cfbf',
    '--text': '#3b3328',
    '--muted': '#8f8473',
    '--accent': '#e0794f',
    '--font': "Georgia, 'Iowan Old Style', serif",
  },
};
