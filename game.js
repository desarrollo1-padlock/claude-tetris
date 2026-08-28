'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_STORAGE_KEY = 'tetris-theme';
const SKIN_STORAGE_KEY = 'tetris.skin';
const GRID_LINE_COLORS = { dark: '#22222e', light: '#e4ddc9' };

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let activeSkin = 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

const NEON_COLORS = [
  null,
  '#00e5ff', // I
  '#fff700', // O
  '#e040fb', // T
  '#39ff14', // S
  '#ff1744', // Z
  '#448aff', // J
  '#ff9100', // L
];

const PASTEL_COLORS = [
  null,
  '#a7d8de', // I
  '#f4e2a8', // O
  '#d9bfe0', // T
  '#bcdfb8', // S
  '#f0b8b8', // Z
  '#b8cef0', // J
  '#f0d0b0', // L
];

const PIXEL_COLORS = [
  null,
  '#3fc7d6',
  '#e6c130',
  '#a04fc0',
  '#5fae5c',
  '#c94f4f',
  '#5f8fd6',
  '#d68b3f',
];

function retroDrawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function neonDrawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = NEON_COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.shadowBlur = 12;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

function pastelDrawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = PASTEL_COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  const px = x * size + 2;
  const py = y * size + 2;
  const w = size - 4;
  const h = size - 4;
  const radius = 4;
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(px, py, w, h, radius);
  } else {
    context.moveTo(px + radius, py);
    context.arcTo(px + w, py, px + w, py + h, radius);
    context.arcTo(px + w, py + h, px, py + h, radius);
    context.arcTo(px, py + h, px, py, radius);
    context.arcTo(px, py, px + w, py, radius);
    context.closePath();
  }
  context.fill();
  context.globalAlpha = 1;
}

function pixelDrawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = PIXEL_COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // dither/checker texture
  context.fillStyle = 'rgba(0,0,0,0.18)';
  const cell = Math.max(2, Math.floor(size / 6));
  for (let dy = 0; dy < size - 2; dy += cell) {
    for (let dx = 0; dx < size - 2; dx += cell) {
      if (((dx / cell) + (dy / cell)) % 2 === 0) {
        context.fillRect(x * size + 1 + dx, y * size + 1 + dy, Math.min(cell, size - 2 - dx), Math.min(cell, size - 2 - dy));
      }
    }
  }
  // hard border
  context.strokeStyle = 'rgba(0,0,0,0.5)';
  context.lineWidth = 1;
  context.strokeRect(x * size + 1.5, y * size + 1.5, size - 3, size - 3);
  context.globalAlpha = 1;
}

const SKINS = {
  retro: {
    colors: COLORS,
    grid: '#22222e',
    background: '#1a1a25',
    drawBlock: retroDrawBlock,
  },
  neon: {
    colors: NEON_COLORS,
    grid: '#0a2a2a',
    background: '#030308',
    drawBlock: neonDrawBlock,
  },
  pastel: {
    colors: PASTEL_COLORS,
    grid: '#e8d9d0',
    background: '#fffaf5',
    drawBlock: pastelDrawBlock,
  },
  pixel: {
    colors: PIXEL_COLORS,
    grid: '#333333',
    background: '#101010',
    drawBlock: pixelDrawBlock,
  },
};

function drawBlock(context, x, y, colorIndex, size, alpha) {
  const skin = SKINS[activeSkin] || SKINS.retro;
  skin.drawBlock(context, x, y, colorIndex, size, alpha);
}

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function drawGrid() {
  ctx.strokeStyle = activeSkin === 'retro' ? GRID_LINE_COLORS[getTheme()] : (SKINS[activeSkin] || SKINS.retro).grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  if (board) draw();
  if (next) drawNext();
}

function toggleTheme() {
  const nextTheme = getTheme() === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}

function applySkin(id) {
  activeSkin = SKINS[id] ? id : 'retro';
  document.body.setAttribute('data-skin', activeSkin);
  if (skinSelect) skinSelect.value = activeSkin;
  if (board && current) draw();
  if (next) drawNext();
}

function loadSkin() {
  let stored = null;
  try {
    stored = localStorage.getItem(SKIN_STORAGE_KEY);
  } catch (e) {
    stored = null;
  }
  applySkin(stored && SKINS[stored] ? stored : 'retro');
}

function changeSkin() {
  const id = skinSelect.value;
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, id);
  } catch (e) {
    // ignore storage errors
  }
  applySkin(id);
}

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);
if (skinSelect) skinSelect.addEventListener('change', changeSkin);

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark');
init();
loadSkin();
