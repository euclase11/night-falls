import { h } from './util.js';
import { refLabel } from './store.js';
import { plainText } from './richtext.js';
import { fuzzyRank } from './fuzzy.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TYPE_ICONS = {
    characters: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>',
    settlements: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-3-4.5-6-7.5-6-12a6 6 0 0 1 12 0c0 4.5-3 7.5-6 12z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    events: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18M8 15h2M14 15h2M8 18h2M14 18h2"/></svg>',
    misc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/></svg>',
    gallery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-4.5-4.5L6 21"/></svg>',
};

const BLANK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>';

const STORAGE_PREFIX = 'board:';
const NOTE_W = 190;
const NOTE_H = 260;
const NOTE_MAX_W = 288;
const GAP = 24;
const EDGE_PAD = 40;
const LONG_PRESS_MS = 550;
const MOVE_CANCEL = 10;
const DRAG_THRESHOLD = 5;
const WORLD_LABELS = { real: 'реальный мир', afterlife: 'посмертие' };
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;

let activeBoard = null;
let pendingRedrawFrame = 0;

export function destroyBoardView() {
    if (pendingRedrawFrame) {
        cancelAnimationFrame(pendingRedrawFrame);
        pendingRedrawFrame = 0;
    }
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
            removed: Array.isArray(raw.removed) ? raw.removed : [],
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

export function createBoardView({ all, world, userId, relations }, callbacks) {
    destroyBoardView();
    const controller = new AbortController();
    activeBoard = controller;
    const { signal } = controller;

    const scope = `${userId ?? 'guest'}:${world}`;
    const byKey = new Map(all.map((entry) => [`${entry.table}:${entry.id}`, entry]));

    const backlinks = new Map();
    for (const item of all) {
        const itemKey = `${item.table}:${item.id}`;
        for (const link of item.links ?? []) {
            if (!backlinks.has(link)) backlinks.set(link, new Set());
            backlinks.get(link).add(itemKey);
        }
    }

    const state = { pressTimer: null, pressX: 0, pressY: 0, longPressed: false, suppressClick: false };
    let zoom = 1;
    try {
        const savedZoom = Number(localStorage.getItem('boardZoom'));
        if (savedZoom >= MIN_ZOOM && savedZoom <= MAX_ZOOM) zoom = savedZoom;
    } catch {
        zoom = 1;
    }
    let graph = null;
    let blank = null;
    let toastTimer = null;
    const relationsMap = new Map();
    for (const rel of relations ?? []) {
        const a = `characters:${rel.from_id}`;
        const b = `characters:${rel.to_id}`;
        if (!relationsMap.has(a)) relationsMap.set(a, new Set());
        if (!relationsMap.has(b)) relationsMap.set(b, new Set());
        relationsMap.get(a).add(b);
        relationsMap.get(b).add(a);
    }

    const threads = svgEl('svg', { class: 'board-threads', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const canvas = h('div', { class: 'board-canvas' }, threads);
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.transformOrigin = '0 0';
    canvas.style.willChange = 'transform';

    const zoomBox = h('div', { class: 'board-zoom' }, canvas);
    zoomBox.style.position = 'relative';

    const scroll = h('div', { class: 'board-scroll' }, zoomBox);
    const emptyHint = h('p', { class: 'board-empty' }, 'Нажмите на доску, чтобы начать исследование');
    const toastEl = h('div', { class: 'board-toast', role: 'status' });
    const zoomControls = h(
        'div',
        { class: 'map-zoom' },
        h('button', { type: 'button', 'aria-label': 'Приблизить', onClick: () => setZoom(zoom * 1.2) }, '+'),
        h('button', { type: 'button', 'aria-label': 'Отдалить', onClick: () => setZoom(zoom / 1.2) }, '−'),
        h(
            'button',
            {
                type: 'button',
                'aria-label': 'Сбросить масштаб',
                onClick: () => {
                    setZoom(1);
                    centerView();
                },
            },
            '⟲'
        )
    );
    const board = h('div', { class: 'board' }, scroll, zoomControls, emptyHint, toastEl);
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
        const backs = backlinks.get(key);
        if (backs) {
            for (const srcKey of backs) {
                if (srcKey !== key && byKey.has(srcKey)) result.add(srcKey);
            }
        }
        if (relationsMap?.has(key)) {
            for (const relKey of relationsMap.get(key)) {
                if (relKey !== key && byKey.has(relKey)) result.add(relKey);
            }
        }
        return [...result];
    }

    function recomputeEdges(targetGraph = graph) {
        if (!targetGraph) return;
        const next = new Set();
        for (const key of targetGraph.nodes.keys()) {
            for (const neighbor of neighborKeys(key)) {
                if (targetGraph.nodes.has(neighbor)) next.add(edgeKey(key, neighbor));
            }
        }
        targetGraph.edges = next;
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
        return {
            root: saved.root,
            nodes,
            edges,
            explored: new Set(saved.explored.filter((key) => nodes.has(key))),
            removed: new Set(saved.removed.filter((key) => byKey.has(key) && !nodes.has(key))),
        };
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
            removed: [...(graph.removed ?? [])],
        });
    }

    function bounds() {
        const halfW = Math.max(canvas.clientWidth, 1600) / 2;
        const halfH = Math.max(canvas.clientHeight, 1100) / 2;
        return {
            minX: -halfW + NOTE_MAX_W / 2 + EDGE_PAD,
            maxX: halfW - NOTE_MAX_W / 2 - EDGE_PAD,
            minY: -halfH + EDGE_PAD,
            maxY: halfH - NOTE_H - EDGE_PAD,
        };
    }

    function clampWithBounds(point, limit) {
        return {
            x: Math.min(limit.maxX, Math.max(limit.minX, point.x)),
            y: Math.min(limit.maxY, Math.max(limit.minY, point.y)),
        };
    }

    function clampPoint(point) {
        return clampWithBounds(point, bounds());
    }

    function overlaps(point, others) {
        return others.some(
            (other) =>
                Math.abs(other.x - point.x) < NOTE_W + GAP &&
                Math.abs(other.y - point.y) < NOTE_H + GAP
        );
    }

    function placeAround(parent, keys) {
        if (!keys.length) return;
        const fromNode = parent.from ? graph.nodes.get(parent.from) : null;
        const isFull = !fromNode || parent.key === graph.root;
        const baseAngle = fromNode
            ? Math.atan2(parent.y - fromNode.y, parent.x - fromNode.x)
            : -Math.PI / 2;
        const spread = keys.length > 1 ? (isFull ? Math.PI * 2 : Math.PI * 1.4) : 0;
        const placed = [...graph.nodes.values()];
        const limit = bounds();

        const radii = [300, 360, 430, 510, 600, 700, 820];
        const turns = [0, 0.18, -0.18, 0.35, -0.35, 0.52, -0.52, 0.7, -0.7, 0.88, -0.88, 1.05, -1.05];

        keys.forEach((key, index) => {
            const angleOffset = keys.length > 1
                ? (index / (keys.length - 1) - 0.5) * spread
                : 0;
            const idealAngle = baseAngle + angleOffset;
            let spot = null;

            outer: for (const radius of radii) {
                for (const turn of turns) {
                    const angle = idealAngle + turn;
                    const candidate = clampWithBounds({
                        x: parent.x + Math.cos(angle) * radius,
                        y: parent.y + Math.sin(angle) * radius,
                    }, limit);
                    if (!overlaps(candidate, placed)) {
                        spot = candidate;
                        break outer;
                    }
                }
            }

            if (!spot) {
                for (let radius = 300; radius < 1000 && !spot; radius += 50) {
                    for (let step = 0; step < 24 && !spot; step++) {
                        const angle = (step / 24) * Math.PI * 2;
                        const candidate = clampWithBounds({
                            x: parent.x + Math.cos(angle) * radius,
                            y: parent.y + Math.sin(angle) * radius,
                        }, limit);
                        if (!overlaps(candidate, placed)) spot = candidate;
                    }
                }
            }

            if (!spot) {
                spot = clampWithBounds({
                    x: parent.x + Math.cos(idealAngle) * 340,
                    y: parent.y + Math.sin(idealAngle) * 340,
                }, limit);
            }

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

    function autofill() {
        if (!graph) return false;
        let added = false;
        for (const key of [...graph.explored]) {
            const node = graph.nodes.get(key);
            if (!node) continue;
            const fresh = neighborKeys(key).filter((n) => !graph.nodes.has(n) && !graph.removed.has(n));
            if (fresh.length) {
                placeAround(node, fresh);
                added = true;
            }
        }
        if (added) recomputeEdges();
        return added;
    }

    function explore(key) {
        const parent = graph?.nodes.get(key);
        if (!parent) return;
        const neighbors = neighborKeys(key);
        for (const n of neighbors) graph.removed.delete(n);
        placeAround(parent, neighbors.filter((item) => !graph.nodes.has(item)));
        graph.explored.add(key);
        recomputeEdges();
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
            removed: new Set(),
        };
        blank = null;
        explore(key);
    }

    function removeNode(key) {
        if (!graph || key === graph.root) return;
        graph.nodes.delete(key);
        graph.explored.delete(key);
        graph.removed.add(key);
        recomputeEdges();
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

    function buildMedia(entry) {
        if (entry.imageUrl) {
            return h(
                'div',
                { class: 'board-note-media is-photo' },
                h('img', { src: entry.imageUrl, alt: '', loading: 'lazy', decoding: 'async' })
            );
        }
        const media = h('div', {
            class: 'board-note-media is-icon',
            'data-table': entry.table,
            'aria-hidden': 'true',
        });
        media.innerHTML = TYPE_ICONS[entry.table] ?? TYPE_ICONS.misc;
        return media;
    }

    function setupDrag(noteEl, node) {
        let pressTimer = null;
        let drag = null;

        const cleanup = () => {
            clearTimeout(pressTimer);
            pressTimer = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
        };

        function onMove(event) {
            if (!drag) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;

            if (!drag.active) {
                if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                clearTimeout(pressTimer);
                pressTimer = null;
                drag.active = true;
                noteEl.classList.add('is-dragging');
                canvas.classList.add('is-dragging');
                const rect = noteEl.getBoundingClientRect();
                drag.offsetX = drag.startX - (rect.left + rect.width / 2);
                drag.offsetY = drag.startY - rect.top;
                drag.canvasRect = canvas.getBoundingClientRect();
                drag.limit = bounds();
            }

            const next = {
                x: (event.clientX - drag.canvasRect.left - drag.canvasRect.width / 2 - drag.offsetX) / zoom,
                y: (event.clientY - drag.canvasRect.top - drag.canvasRect.height / 2 - drag.offsetY) / zoom,
            };
            const clamped = clampWithBounds(next, drag.limit);
            node.x = clamped.x;
            node.y = clamped.y;
            noteEl.style.left = `calc(50% + ${node.x}px)`;
            noteEl.style.top = `calc(50% + ${node.y}px)`;
            scheduleRedraw();
        }

        function onUp() {
            cleanup();
            if (drag?.active) {
                state.suppressClick = true;
                setTimeout(() => { state.suppressClick = false; }, 60);
                noteEl.classList.remove('is-dragging');
                canvas.classList.remove('is-dragging');
                persist();
            }
            drag = null;
        }

        function onCancel() {
            cleanup();
            if (drag?.active) {
                node.x = drag.originalX;
                node.y = drag.originalY;
                noteEl.style.left = `calc(50% + ${node.x}px)`;
                noteEl.style.top = `calc(50% + ${node.y}px)`;
                scheduleRedraw();
                noteEl.classList.remove('is-dragging');
                canvas.classList.remove('is-dragging');
            }
            drag = null;
        }

        noteEl.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (event.target.closest('button')) return;

            drag = {
                startX: event.clientX,
                startY: event.clientY,
                offsetX: 0,
                offsetY: 0,
                originalX: node.x,
                originalY: node.y,
                canvasRect: null,
                limit: null,
                active: false,
            };

            if (event.pointerType === 'touch') {
                const { clientX, clientY, target } = event;
                pressTimer = setTimeout(() => {
                    pressTimer = null;
                    if (drag?.active) return;
                    state.longPressed = true;
                    drag = null;
                    openContext(target, clientX, clientY);
                }, LONG_PRESS_MS);
            }

            window.addEventListener('pointermove', onMove, { passive: true });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);
        });
    }

    function buildNote(node) {
        const entry = byKey.get(node.key);
        if (!entry) return null;
        const seed = hash(node.key);
        const tilt = (((seed >>> 3) % 61) - 30) / 10;
        const kind = `${refLabel(entry)}${entry.meta ? ` · ${entry.meta}` : ''}`;
        const text = plainText(entry.description).trim();
        const noteEl = h(
            'div',
            {
                class: `board-note paper-${seed % 3} style-${(seed >>> 5) % 3}${node.key === graph.root ? ' is-root' : ''}`,
                dataset: { entry: node.key, board: node.key },
                role: 'button',
                tabindex: '0',
                'aria-label': `${kind}: ${entry.name}`,
                style: `left: calc(50% + ${node.x}px); top: calc(50% + ${node.y}px); --tilt: ${tilt}deg;`,
            },
            h('span', { class: 'board-pin', 'data-table': entry.table }),
            buildMedia(entry),
            h('span', { class: 'board-note-kind' }, kind),
            h('h3', {}, entry.name),
            text ? h('p', {}, text) : null
        );
        setupDrag(noteEl, node);
        return noteEl;
    }

    function buildBlank() {
        const blankIcon = h('span', { class: 'board-blank-icon', 'aria-hidden': 'true' });
        blankIcon.innerHTML = BLANK_ICON_SVG;
        return h(
            'div',
            {
                class: 'board-note is-blank paper-0 style-plain',
                style: `left: calc(50% + ${blank.x}px); top: calc(50% + ${blank.y}px); --tilt: -1.5deg;`,
            },
            h('span', { class: 'board-pin' }),
            blankIcon,
            h('p', { class: 'board-blank-caption' }, 'С чего начать'),
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

    function scheduleRedraw() {
        if (pendingRedrawFrame) return;
        pendingRedrawFrame = requestAnimationFrame(() => {
            pendingRedrawFrame = 0;
            redrawThreads();
        });
    }

    function redrawThreads() {
        if (!graph) {
            if (threads.childNodes.length) threads.replaceChildren();
            return;
        }
        const edges = [...graph.edges];
        const needed = edges.length * 3;
        const parent = threads;

        while (parent.childNodes.length > needed) parent.removeChild(parent.lastChild);
        while (parent.childNodes.length < needed) {
            parent.append(
                svgEl('path', { class: 'board-thread-shadow', transform: 'translate(2 3)' }),
                svgEl('path', { class: 'board-thread' }),
                svgEl('path', { class: 'board-thread-hi' })
            );
        }

        const children = parent.childNodes;
        for (let i = 0; i < edges.length; i += 1) {
            const [fromKey, toKey] = edges[i].split('|');
            const from = graph.nodes.get(fromKey);
            const to = graph.nodes.get(toKey);
            if (!from || !to) continue;
            const d = threadPath(from, to);
            children[i * 3].setAttribute('d', d);
            children[i * 3 + 1].setAttribute('d', d);
            children[i * 3 + 2].setAttribute('d', d);
        }
    }

    function draw() {
        canvas.querySelectorAll('.board-note').forEach((node) => node.remove());
        if (graph) {
            const nodes = [...graph.nodes.values()].map((node) => buildNote(node)).filter(Boolean);
            canvas.append(...nodes);
        }
        redrawThreads();
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
                        class: `map-menu-item board-menu-item${item.tone ? ` tone-${item.tone}` : ''}`,
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
            if (!graph.explored.has(key)) {
                items.push({ label: 'Исследовать', tone: 'explore', run: () => explore(key) });
            }
            items.push({ label: 'Убрать', tone: 'danger', run: () => removeNode(key) });
            openMenu(x, y, items);
            return;
        }
        if (graph) openMenu(x, y, [{ label: 'Сбросить доску', tone: 'warning', run: resetBoard }]);
    }

    function pointFromEvent(event) {
        return canvasPoint(event.clientX, event.clientY);
    }

    function clearPress() {
        clearTimeout(state.pressTimer);
        state.pressTimer = null;
    }

    canvas.addEventListener('click', (event) => {
        if (state.suppressClick) { state.suppressClick = false; return; }
        if (state.longPressed) { state.longPressed = false; return; }
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
        if (event.target.closest('.board-note')) return;
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
        applyZoom();
    }

    function applyZoom() {
        const width = Math.max(1600, Math.ceil(scroll.clientWidth / zoom));
        const height = Math.max(1100, Math.ceil(scroll.clientHeight / zoom));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.transform = `scale(${zoom})`;
        zoomBox.style.width = `${Math.round(width * zoom)}px`;
        zoomBox.style.height = `${Math.round(height * zoom)}px`;
    }

    function canvasPoint(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / zoom - canvas.clientWidth / 2,
            y: (clientY - rect.top) / zoom - canvas.clientHeight / 2,
        };
    }

    function setZoom(next, clientX, clientY) {
        const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        if (Math.abs(target - zoom) < 0.001) return;
        const view = scroll.getBoundingClientRect();
        const originX = clientX ?? view.left + view.width / 2;
        const originY = clientY ?? view.top + view.height / 2;
        const anchor = canvasPoint(originX, originY);
        zoom = target;
        applyZoom();
        scroll.scrollLeft = (canvas.clientWidth / 2 + anchor.x) * zoom - (originX - view.left);
        scroll.scrollTop = (canvas.clientHeight / 2 + anchor.y) * zoom - (originY - view.top);
        closeMenu();
        try {
            localStorage.setItem('boardZoom', String(zoom));
        } catch {
            return;
        }
    }

    scroll.addEventListener(
        'wheel',
        (event) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX, event.clientY);
        },
        { passive: false }
    );

    function centerView() {
        const root = graph ? graph.nodes.get(graph.root) : null;
        const targetX = (canvas.clientWidth / 2 + (root ? root.x : 0)) * zoom;
        const targetY = (canvas.clientHeight / 2 + (root ? root.y + NOTE_H / 2 : 0)) * zoom;
        scroll.scrollLeft = targetX - scroll.clientWidth / 2;
        scroll.scrollTop = targetY - scroll.clientHeight / 2;
    }

    const observer = new ResizeObserver(syncViewBox);
    observer.observe(canvas);
    signal.addEventListener('abort', () => observer.disconnect());
    window.addEventListener('resize', fit, { signal });

    graph = hydrate(readSaved(scope));
    if (graph) {
        autofill();
        recomputeEdges();
        persist();
    }
    draw();
    requestAnimationFrame(() => {
        fit();
        syncViewBox();
        centerView();
    });

    return board;
}