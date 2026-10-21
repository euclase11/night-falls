import { h } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SHOW_DELAY = 250;
const SLOW_DELAY = 8000;

function svgEl(name, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function toothGear(className, x, y, ring, count, rim, spokes, hub) {
  const dash = ((2 * Math.PI * ring) / (count * 2)).toFixed(2);
  return svgEl(
    'g',
    { transform: `translate(${x} ${y})` },
    svgEl(
      'g',
      { class: `ld-gear ${className}` },
      svgEl('circle', { class: 'ld-teeth', r: ring, 'stroke-dasharray': `${dash} ${dash}` }),
      svgEl('circle', { class: 'ld-rim', r: rim }),
      svgEl('path', { class: 'ld-spoke', d: spokes }),
      svgEl('circle', { class: 'ld-hub', r: hub })
    )
  );
}

function buildGears() {
  return svgEl(
    'svg',
    { class: 'ld-gears', viewBox: '0 0 64 48', 'aria-hidden': 'true' },
    toothGear('ld-gear-a', 22, 24, 14, 12, 11, 'M-8 0H8M-4 -6.93L4 6.93M4 -6.93L-4 6.93', 2.4),
    toothGear('ld-gear-b', 45, 24, 9, 8, 6.5, 'M-5 0H5M-2.5 -4.33L2.5 4.33M2.5 -4.33L-2.5 4.33', 2)
  );
}

function buildRails() {
  const ties = Array.from({ length: 6 }, (_, index) =>
    svgEl('line', { class: 'ld-tie', x1: 10, x2: 54, y1: 12, y2: 12, style: `--i:${index}` })
  );
  return svgEl(
    'svg',
    { class: 'ld-rails', viewBox: '0 0 64 48', 'aria-hidden': 'true' },
    svgEl(
      'defs',
      {},
      svgEl(
        'linearGradient',
        { id: 'ld-rail-grad', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 12, x2: 0, y2: 46 },
        svgEl('stop', { offset: '0', 'stop-color': '#fbeff3', 'stop-opacity': '0' }),
        svgEl('stop', { offset: '1', 'stop-color': '#fbeff3', 'stop-opacity': '0.95' })
      )
    ),
    svgEl('path', { class: 'ld-rail', d: 'M10 46L30 12' }),
    svgEl('path', { class: 'ld-rail', d: 'M54 46L34 12' }),
    ...ties,
    svgEl('circle', { class: 'ld-lamp', cx: 32, cy: 9.5, r: 2 })
  );
}

const text = h('p', { class: 'loader-text' }, 'Загрузка...');
const overlay = h(
  'div',
  { class: 'loader', role: 'status', 'aria-live': 'polite', hidden: true },
  h(
    'div',
    { class: 'loader-card' },
    h('div', { class: 'loader-art' }, h('div', { class: 'ld-glow' }), buildGears(), buildRails()),
    text
  )
);
document.body.append(overlay);

let active = 0;
let showTimer = null;
let slowTimer = null;
let hideTimer = null;

function reveal() {
  clearTimeout(hideTimer);
  text.textContent = 'Загрузка...';
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  slowTimer = setTimeout(() => {
    text.textContent = 'Загрузка затянулась. Проверьте соединение или обновите страницу.';
  }, SLOW_DELAY);
}

function conceal() {
  clearTimeout(slowTimer);
  if (overlay.hidden) return;
  overlay.classList.remove('is-visible');
  hideTimer = setTimeout(() => {
    overlay.hidden = true;
  }, 220);
}

export const loader = {
  start() {
    active += 1;
    if (active === 1) showTimer = setTimeout(reveal, SHOW_DELAY);
  },
  stop() {
    active = Math.max(0, active - 1);
    if (active > 0) return;
    clearTimeout(showTimer);
    showTimer = null;
    conceal();
  },
};