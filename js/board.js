import { h } from './util.js';
import { refLabel } from './store.js';
import { plainText } from './richtext.js';
import { fuzzyRank } from './fuzzy.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE_PREFIX = 'board:';
const NOTE_W = 190;
const NOTE_H = 250;
const GAP = 24;
const LONG_PRESS_MS = 550;
const MOVE_CANCEL = 10;
const WORLD_LABELS = { real: 'реальный мир', afterlife: 'посмертие' };
const ICONS = {
  characters: ['👤'],
  settlements: ['📍', '🏘️', '🗺️'],
  events: ['🗓️'],
  misc: ['🗃️', '📋', '📑', '🗒️'],
  gallery: ['🖼️'],
};

let activeBoard = null;

export function destroyBoardView() {
  activeBoard?.abort();
  activeBoard = null;
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function readSaved(scope) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_PREFIX + scope) || 'null');
    if (!raw || typeof raw.root !== 'string' || !Array.isArray(raw.nodes)) return null;
    return {
      root: raw.root,
      nodes: raw.nodes.filter((node) => typeof node.key === 'string' && Number.isFinite(node.x) && Number.isFinite(node.y)),
      edges: Array.isArray(raw.edges) ? raw.edges.filter((edge) => Array.isArray(edge) && edge.length === 2) : [],
      explored: Array.isArray(raw.explored) ? raw.explored : [],
    };
  } catch {
    return null;
  }
}

function writeSaved(scope, value) {
  try {
    if (value) localStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_PREFIX + scope);
  } catch {
    return;
  }
}

function pruneUnreachable(graph) {
  const adjacency = new Map();
  for (const edge of graph.edges) {
    const [a, b] = edge.split('|');
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  const seen = new Set([graph.root]);
  const queue = [graph.root];
  while (queue.length) {
    const current = queue.pop();
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  for (const key of [...graph.nodes.keys()]) {
    if (!seen.has(key)) {
      graph.nodes.delete(key);
      graph.explored.delete(key);
    }
  }
  for (const edge of [...graph.edges]) {
    const [a, b] = edge.split('|');
    if (!seen.has(a) || !seen.has(b)) graph.edges.delete(edge);
  }
}

function threadPath(a, b) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = Math.min(46, dist * 0.14);
  return `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}`;
}

function openPicker({ all, world, onPick }) {
  const input = h('input', { type: 'search', class: 'rt-search-input', placeholder: 'Название записи', autocomplete: 'off' });
  const otherWorld = h('input', { type: 'checkbox' });
  const toggle = h('label', { class: 'board-picker-toggle' }, otherWorld, 'Показывать записи из другого мира');
  const list = h('ul', { class: 'rt-search-list' });
  const card = h(
    'div',
    { class: 'rt-search-card' },
    h('h3', {}, 'С какой записи начать'),
    input,
    toggle,
    list,
    h('button', { type: 'button', class: 'rt-search-cancel', onClick: () => close() }, 'Отмена')
  );
  const overlay = h('div', { class: 'rt-search', role: 'dialog', 'aria-modal': 'true' }, card);

  function draw() {
    const pool = all
      .filter((entry) => otherWorld.checked || !entry.world || entry.world === world)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const query = input.value.trim();
    const rows = query ? fuzzyRank(pool, query, (entry) => entry.name, 60) : pool;
    if (!rows.length) {
      list.replaceChildren(h('li', { class: 'links-hint' }, 'Ничего не найдено'));
      return;
    }
    list.replaceChildren(
      ...rows.map((entry) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                close();
                onPick(entry);
              },
            },
            h('span', { class: 'related-kind' }, refLabel(entry)),
            h('span', { class: 'related-name' }, entry.name),
            entry.world && entry.world !== world
              ? h('span', { class: 'rt-world' }, WORLD_LABELS[entry.world] ?? entry.world)
              : null
          )
        )
      )
    );
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  }

  input.addEventListener('input', draw);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      list.querySelector('button')?.click();
    }
  });
  otherWorld.addEventListener('change', draw);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  draw();
  input.focus();
}

export function createBoardView({ all, world, userId }, callbacks) {
  destroyBoardView();
  const controller = new AbortController();
  activeBoard = controller;
  const { signal } = controller;

  const scope = `${userId ?? 'guest'}:${world}`;
  const byKey = new Map(all.map((entry) => [`${entry.table}:${entry.id}`, entry]));
  const state = { pressTimer: null, pressX: 0, pressY: 0, longPressed: false };
  let graph = null;
  let blank = null;
  let toastTimer = null;

  const threads = svgEl('svg', { class: 'board-threads', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const canvas = h('div', { class: 'board-canvas' }, threads);
  const scroll = h('div', { class: 'board-scroll' }, canvas);
  const emptyHint = h('p', { class: 'board-empty' }, 'Нажмите на доску, чтобы начать исследование');
  const toastEl = h('div', { class: 'board-toast', role: 'status' });
  const board = h('div', { class: 'board' }, scroll, emptyHint, toastEl);
  const menu = h('div', { class: 'map-menu board-menu', hidden: true });
  document.body.append(menu);

  signal.addEventListener('abort', () => {
    menu.remove();
    clearTimeout(toastTimer);
    clearTimeout(state.pressTimer);
  });

  function neighborKeys(key) {
    const entry = byKey.get(key);
    if (!entry) return [];
    const result = new Set();
    for (const target of entry.links ?? []) {
      if (target !== key && byKey.has(target)) result.add(target);
    }
    for (const item of all) {
      const itemKey = `${item.table}:${item.id}`;
      if (itemKey !== key && (item.links ?? []).includes(key)) result.add(itemKey);
    }
    return [...result];
  }

  function hydrate(saved) {
    if (!saved) return null;
    const nodes = new Map();
    for (const node of saved.nodes) {
      if (byKey.has(node.key)) nodes.set(node.key, { key: node.key, x: node.x, y: node.y, from: node.from ?? null });
    }
    if (!nodes.has(saved.root)) return null;
    const edges = new Set();
    for (const [a, b] of saved.edges) {
      if (nodes.has(a) && nodes.has(b)) edges.add(edgeKey(a, b));
    }
    const result = {
      root: saved.root,
      nodes,
      edges,
      explored: new Set(saved.explored.filter((key) => nodes.has(key))),
    };
    pruneUnreachable(result);
    return result;
  }

  function persist() {
    if (!graph) {
      writeSaved(scope, null);
      return;
    }
    writeSaved(scope, {
      root: graph.root,
      nodes: [...graph.nodes.values()].map(({ key, x, y, from }) => ({ key, x, y, from: from ?? null })),
      edges: [...graph.edges].map((edge) => edge.split('|')),
      explored: [...graph.explored],
    });
  }

  function bounds() {
    const halfW = Math.max(canvas.clientWidth, 1600) / 2;
    const halfH = Math.max(canvas.clientHeight, 1100) / 2;
    return {
      minX: -halfW + NOTE_W / 2 + 20,
      maxX: halfW - NOTE_W / 2 - 20,
      minY: -halfH + 40,
      maxY: halfH - NOTE_H - 20,
    };
  }

  function clampPoint(point) {
    const limit = bounds();
    return {
      x: Math.min(limit.maxX, Math.max(limit.minX, point.x)),
      y: Math.min(limit.maxY, Math.max(limit.minY, point.y)),
    };
  }

  function overlaps(point, others) {
    return others.some((other) => Math.abs(other.x - point.x) < NOTE_W + GAP && Math.abs(other.y - point.y) < NOTE_H + GAP);
  }

  function placeAround(parent, keys) {
    const fromNode = parent.from ? graph.nodes.get(parent.from) : null;
    const full = parent.key === graph.root || !fromNode;
    const base = fromNode ? Math.atan2(parent.y - fromNode.y, parent.x - fromNode.x) : -Math.PI / 2;
    const spread = full ? Math.PI * 2 : Math.PI * 1.4;
    const placed = [...graph.nodes.values()];

    keys.forEach((key, index) => {
      let angle = base;
      if (keys.length > 1) angle = full ? base + (index * spread) / keys.length : base - spread / 2 + (index * spread) / (keys.length - 1);
      let spot = null;
      for (const radius of [310, 440, 570]) {
        for (const turn of [0, 0.28, -0.28, 0.56, -0.56, 0.84, -0.84]) {
          const candidate = {
            x: parent.x + Math.cos(angle + turn) * radius,
            y: parent.y + Math.sin(angle + turn) * radius,
          };
          const bounded = clampPoint(candidate);
          if (Math.hypot(bounded.x - candidate.x, bounded.y - candidate.y) > 40) continue;
          if (!overlaps(bounded, placed)) {
            spot = bounded;
            break;
          }
        }
        if (spot) break;
      }
      if (!spot) spot = clampPoint({ x: parent.x + Math.cos(angle) * 310, y: parent.y + Math.sin(angle) * 310 });
      const node = { key, x: Math.round(spot.x), y: Math.round(spot.y), from: parent.key };
      graph.nodes.set(key, node);
      placed.push(node);
    });
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2200);
  }

  function explore(key) {
    const parent = graph?.nodes.get(key);
    if (!parent) return;
    const neighbors = neighborKeys(key);
    placeAround(parent, neighbors.filter((item) => !graph.nodes.has(item)));
    for (const item of neighbors) graph.edges.add(edgeKey(key, item));
    graph.explored.add(key);
    persist();
    draw();
    if (!neighbors.length) toast('У этой записи нет связей');
  }

  function startFrom(entry) {
    const key = `${entry.table}:${entry.id}`;
    const point = blank ?? { x: 0, y: 0 };
    graph = {
      root: key,
      nodes: new Map([[key, { key, x: Math.round(point.x), y: Math.round(point.y), from: null }]]),
      edges: new Set(),
      explored: new Set(),
    };
    blank = null;
    explore(key);
  }

  function removeNode(key) {
    if (!graph || key === graph.root) return;
    graph.nodes.delete(key);
    graph.explored.delete(key);
    for (const edge of [...graph.edges]) {
      if (edge.split('|').includes(key)) graph.edges.delete(edge);
    }
    pruneUnreachable(graph);
    persist();
    draw();
  }

  function resetBoard() {
    graph = null;
    blank = null;
    persist();
    draw();
  }

  function buildMedia(entry, seed) {
    if (entry.imageUrl) {
      return h(
        'div',
        { class: 'board-note-media is-photo' },
        h('img', { src: entry.imageUrl, alt: '', loading: 'lazy', decoding: 'async' })
      );
    }
    const set = ICONS[entry.table] ?? ICONS.misc;
    return h('div', { class: 'board-note-media is-icon', 'aria-hidden': 'true' }, set[seed % set.length]);
  }

  function buildNote(node) {
    const entry = byKey.get(node.key);
    const seed = hash(node.key);
    const tilt = (((seed >>> 3) % 61) - 30) / 10;
    const kind = `${refLabel(entry)}${entry.meta ? ` · ${entry.meta}` : ''}`;
    const text = plainText(entry.description).trim();
    return h(
      'div',
      {
        class: `board-note paper-${seed % 3} style-${(seed >>> 5) % 3}${node.key === graph.root ? ' is-root' : ''}`,
        dataset: { entry: node.key, board: node.key },
        role: 'button',
        tabindex: '0',
        'aria-label': `${kind}: ${entry.name}`,
        style: `left: calc(50% + ${node.x}px); top: calc(50% + ${node.y}px); --tilt: ${tilt}deg;`,
      },
      h('span', { class: 'board-pin' }),
      buildMedia(entry, seed),
      h('span', { class: 'board-note-kind' }, kind),
      h('h3', {}, entry.name),
      text ? h('p', {}, text) : null
    );
  }

  function buildBlank() {
    return h(
      'div',
      {
        class: 'board-note is-blank paper-0 style-plain',
        style: `left: calc(50% + ${blank.x}px); top: calc(50% + ${blank.y}px); --tilt: -1.5deg;`,
      },
      h('span', { class: 'board-pin' }),
      h(
        'button',
        {
          type: 'button',
          class: 'board-explore',
          onClick: (event) => {
            event.stopPropagation();
            openPicker({ all, world, onPick: startFrom });
          },
        },
        'Исследовать'
      )
    );
  }

  function draw() {
    canvas.querySelectorAll('.board-note').forEach((node) => node.remove());
    const layers = [];
    if (graph) {
      for (const edge of graph.edges) {
        const [from, to] = edge.split('|').map((key) => graph.nodes.get(key));
        if (!from || !to) continue;
        const d = threadPath(from, to);
        layers.push(
          svgEl('path', { d, class: 'board-thread-shadow', transform: 'translate(2 3)' }),
          svgEl('path', { d, class: 'board-thread' }),
          svgEl('path', { d, class: 'board-thread-hi' })
        );
      }
      canvas.append(...[...graph.nodes.values()].map((node) => buildNote(node)));
    }
    threads.replaceChildren(...layers);
    if (blank) canvas.append(buildBlank());
    emptyHint.hidden = Boolean(graph || blank);
  }

  function closeMenu() {
    menu.hidden = true;
  }

  function openMenu(x, y, items) {
    menu.replaceChildren(
      ...items.map((item) =>
        h(
          'button',
          {
            type: 'button',
            class: 'map-menu-item',
            onClick: () => {
              closeMenu();
              item.run();
            },
          },
          item.label
        )
      )
    );
    menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
  }

  function openContext(target, x, y) {
    const note = target instanceof Element ? target.closest('.board-note') : null;
    if (note) {
      const key = note.dataset.board;
      if (!graph || !key || key === graph.root) return;
      const items = [];
      if (!graph.explored.has(key)) items.push({ label: 'Исследовать', run: () => explore(key) });
      items.push({ label: 'Убрать', run: () => removeNode(key) });
      openMenu(x, y, items);
      return;
    }
    if (graph) openMenu(x, y, [{ label: 'Сбросить доску', run: resetBoard }]);
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
  }

  function clearPress() {
    clearTimeout(state.pressTimer);
    state.pressTimer = null;
  }

  canvas.addEventListener('click', (event) => {
    if (state.longPressed) {
      state.longPressed = false;
      return;
    }
    closeMenu();
    const note = event.target.closest('.board-note');
    if (note) {
      if (note.classList.contains('is-blank')) return;
      const entry = byKey.get(note.dataset.board);
      if (entry) callbacks.onSelect(entry, note);
      return;
    }
    if (!graph) {
      blank = clampPoint(pointFromEvent(event));
      draw();
    }
  });

  canvas.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const note = event.target.closest('.board-note');
    if (!note || note.classList.contains('is-blank') || event.target.closest('button')) return;
    event.preventDefault();
    const entry = byKey.get(note.dataset.board);
    if (entry) callbacks.onSelect(entry, note);
  });

  canvas.addEventListener('pointerdown', (event) => {
    state.longPressed = false;
    if (event.pointerType !== 'touch') return;
    clearPress();
    const { clientX, clientY, target } = event;
    state.pressX = clientX;
    state.pressY = clientY;
    state.pressTimer = setTimeout(() => {
      state.pressTimer = null;
      state.longPressed = true;
      openContext(target, clientX, clientY);
    }, LONG_PRESS_MS);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (state.pressTimer && Math.hypot(event.clientX - state.pressX, event.clientY - state.pressY) > MOVE_CANCEL) clearPress();
  });
  canvas.addEventListener('pointerup', clearPress);
  canvas.addEventListener('pointercancel', clearPress);

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    state.longPressed = true;
    openContext(event.target, event.clientX, event.clientY);
  });

  scroll.addEventListener('scroll', closeMenu, { passive: true });

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!menu.hidden && !menu.contains(event.target)) closeMenu();
    },
    { signal }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') closeMenu();
    },
    { signal }
  );

  function syncViewBox() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    threads.setAttribute('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`);
  }

  function fit() {
    const top = board.getBoundingClientRect().top + window.scrollY;
    const tabs = document.getElementById('tabs');
    const reserved = tabs && getComputedStyle(tabs).position === 'fixed' ? tabs.offsetHeight : 0;
    board.style.height = `${Math.max(360, window.innerHeight - top - reserved - 12)}px`;
  }

  function centerView() {
    const root = graph ? graph.nodes.get(graph.root) : null;
    const targetX = canvas.clientWidth / 2 + (root ? root.x : 0);
    const targetY = canvas.clientHeight / 2 + (root ? root.y + NOTE_H / 2 : 0);
    scroll.scrollLeft = targetX - scroll.clientWidth / 2;
    scroll.scrollTop = targetY - scroll.clientHeight / 2;
  }

  const observer = new ResizeObserver(syncViewBox);
  observer.observe(canvas);
  signal.addEventListener('abort', () => observer.disconnect());
  window.addEventListener('resize', fit, { signal });

  graph = hydrate(readSaved(scope));
  draw();

  requestAnimationFrame(() => {
    fit();
    syncViewBox();
    centerView();
  });

  return board;
}