import type { OverlayApi } from '../../preload/api';
import './overlay.css';

declare global {
  interface Window {
    undertoneOverlay: OverlayApi;
  }
}

const api = window.undertoneOverlay;
const shot = document.getElementById('shot') as HTMLImageElement;
const selection = document.getElementById('selection') as HTMLDivElement;
const sizeLabel = document.getElementById('size') as HTMLSpanElement;
const hint = document.getElementById('hint') as HTMLDivElement;

let start: { x: number; y: number } | null = null;
let finished = false;

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.min(a.x, b.x));
  const y = Math.max(0, Math.min(a.y, b.y));
  const right = Math.min(window.innerWidth, Math.max(a.x, b.x));
  const bottom = Math.min(window.innerHeight, Math.max(a.y, b.y));
  return { x, y, width: right - x, height: bottom - y };
}

function draw(r: { x: number; y: number; width: number; height: number }): void {
  selection.hidden = false;
  selection.style.left = `${r.x}px`;
  selection.style.top = `${r.y}px`;
  selection.style.width = `${r.width}px`;
  selection.style.height = `${r.height}px`;
  sizeLabel.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
}

function finish(r: { x: number; y: number; width: number; height: number } | null): void {
  if (finished) return;
  finished = true;
  if (!r) void api.cancel();
  else void api.done({ x: r.x / window.innerWidth, y: r.y / window.innerHeight, width: r.width / window.innerWidth, height: r.height / window.innerHeight });
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return finish(null);
  start = { x: e.clientX, y: e.clientY };
  hint.classList.add('dim');
});
window.addEventListener('mousemove', (e) => {
  if (start) draw(rectFrom(start, { x: e.clientX, y: e.clientY }));
});
window.addEventListener('mouseup', (e) => {
  if (!start) return;
  const r = rectFrom(start, { x: e.clientX, y: e.clientY });
  start = null;
  if (r.width < 8 || r.height < 8) {
    selection.hidden = true;
    hint.classList.remove('dim');
    return;
  }
  finish(r);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') finish(null);
  if (e.key === 'Enter') finish({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

void api.getImage().then((url) => {
  if (!url) return finish(null);
  shot.src = url;
});
