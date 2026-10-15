import { h, applyColor } from './util.js';
import { openForm } from './addEntry.js';
import { supabase } from './supabase.js';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.2;
const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 600;

function renderDot(settlement) {
  const dot = h('span', { class: 'dot' }, String(settlement.number ?? ''));
  applyColor(dot, settlement.color);
  return dot;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createMapView(settlements, settings, callbacks) {
  const stage = h('div', { class: 'map-stage' });
  const img = h('img', {
    class: 'map-image',
    src: settings.mapImage,
    alt: settings.mapAlt,
    draggable: 'false',
  });
  stage.append(img);

  const state = {
    scale: 1,
    tx: 0,
    ty: 0,
    isDragging: false,
    moved: false,
    gesture: null,
    pointers: new Map(),
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    pinchDist: 0,
    pressTimer: null,
  };

  const markers = settlements.map((s) => {
    const marker = h(
      'button',
      {
        type: 'button',
        class: 'marker',
        'aria-label': `${s.number ?? ''}. ${s.name}`,
        dataset: { settlement: String(s.id) },
      },
      String(s.number ?? '')
    );
    if (s.x != null) marker.style.left = `${s.x}%`;
    if (s.y != null) marker.style.top = `${s.y}%`;
    applyColor(marker, s.color);
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.moved) return;
      callbacks.onSelect(s, marker);
    });
    return marker;
  });
  stage.append(...markers);

  const viewport = h('div', { class: 'map-viewport' }, stage);

  const zoomControls = h(
    'div',
    { class: 'map-zoom' },
    h('button', { type: 'button', 'aria-label': 'Приблизить', onClick: () => zoomBy(ZOOM_STEP) }, '+'),
    h('button', { type: 'button', 'aria-label': 'Отдалить', onClick: () => zoomBy(1 / ZOOM_STEP) }, '−'),
    h('button', { type: 'button', 'aria-label': 'Сбросить', onClick: resetView }, '⟲')
  );
  viewport.append(zoomControls);

  const legend = h(
    'ul',
    { class: 'map-legend' },
    settlements.map((s) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: 'legend-item',
            dataset: { settlement: String(s.id) },
            onClick: (event) => callbacks.onSelect(s, event.currentTarget),
          },
          renderDot(s),
          s.name
        )
      )
    )
  );

  function applyTransform() {
    stage.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    const canPan =
      stage.offsetWidth * state.scale > viewport.clientWidth + 1 ||
      stage.offsetHeight * state.scale > viewport.clientHeight + 1;
    viewport.classList.toggle('can-pan', canPan);
  }

  function clampPan() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const sw = stage.offsetWidth * state.scale;
    const sh = stage.offsetHeight * state.scale;

    state.tx = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, state.tx));
    state.ty = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, state.ty));
  }

  function zoomBy(factor, originX, originY) {
    const ox = originX ?? viewport.clientWidth / 2;
    const oy = originY ?? viewport.clientHeight / 2;

    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale * factor));
    const ratio = newScale / state.scale;

    state.tx = ox - (ox - state.tx) * ratio;
    state.ty = oy - (oy - state.ty) * ratio;
    state.scale = newScale;

    clampPan();
    applyTransform();
  }

  function resetView() {
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
    clampPan();
    applyTransform();
  }

  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomBy(factor, event.clientX - rect.left, event.clientY - rect.top);
    },
    { passive: false }
  );

  const menu = h(
    'div',
    { class: 'map-menu', hidden: true },
    h('button', { type: 'button', class: 'map-menu-item' }, '+ Добавить поселение')
  );
  document.body.append(menu);

  function closeMenu() {
    menu.hidden = true;
  }

  async function openMenuAt(clientX, clientY) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const rect = viewport.getBoundingClientRect();
    const localX = (clientX - rect.left - state.tx) / state.scale;
    const localY = (clientY - rect.top - state.ty) / state.scale;
    const percentX = Math.max(0, Math.min(100, (localX / stage.offsetWidth) * 100));
    const percentY = Math.max(0, Math.min(100, (localY / stage.offsetHeight) * 100));

    menu.style.left = `${Math.min(clientX, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(clientY, window.innerHeight - 60)}px`;
    menu.hidden = false;

    const oldButton = menu.querySelector('.map-menu-item');
    const newButton = oldButton.cloneNode(true);
    newButton.addEventListener('click', () => {
      closeMenu();
      openForm('settlements', {
        x: Number(percentX.toFixed(2)),
        y: Number(percentY.toFixed(2)),
      });
    });
    oldButton.replaceWith(newButton);
  }

  function clearPress() {
    clearTimeout(state.pressTimer);
    state.pressTimer = null;
  }

  function beginGesture() {
    const points = [...state.pointers.values()];
    if (points.length === 1) {
      state.gesture = 'pan';
      state.startX = points[0].x;
      state.startY = points[0].y;
      state.startTx = state.tx;
      state.startTy = state.ty;
    } else if (points.length >= 2) {
      state.gesture = 'pinch';
      state.pinchDist = distance(points[0], points[1]);
      clearPress();
    }
  }

  viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('.map-zoom')) return;

    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.moved = false;
    state.isDragging = false;
    beginGesture();

    if (event.pointerType === 'touch' && state.pointers.size === 1) {
      const { clientX, clientY } = event;
      clearPress();
      state.pressTimer = setTimeout(() => {
        state.pressTimer = null;
        if (state.isDragging || state.pointers.size !== 1) return;
        state.moved = true;
        openMenuAt(clientX, clientY);
      }, LONG_PRESS_MS);
    }
  });

  window.addEventListener('pointermove', (event) => {
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...state.pointers.values()];

    if (state.gesture === 'pinch' && points.length >= 2) {
      const dist = distance(points[0], points[1]);
      if (state.pinchDist > 0) {
        const rect = viewport.getBoundingClientRect();
        const cx = (points[0].x + points[1].x) / 2 - rect.left;
        const cy = (points[0].y + points[1].y) / 2 - rect.top;
        zoomBy(dist / state.pinchDist, cx, cy);
      }
      state.pinchDist = dist;
      state.moved = true;
      return;
    }

    if (state.gesture !== 'pan') return;

    const dx = points[0].x - state.startX;
    const dy = points[0].y - state.startY;

    if (!state.isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      state.isDragging = true;
      state.moved = true;
      clearPress();
      viewport.classList.add('is-panning');
    }

    if (state.isDragging) {
      state.tx = state.startTx + dx;
      state.ty = state.startTy + dy;
      clampPan();
      applyTransform();
    }
  });

  function endPointer(event) {
    if (!state.pointers.delete(event.pointerId)) return;
    clearPress();

    if (state.pointers.size === 0) {
      state.gesture = null;
      state.isDragging = false;
      viewport.classList.remove('is-panning');
      setTimeout(() => {
        state.moved = false;
      }, 0);
    } else {
      beginGesture();
    }
  }

  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  viewport.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openMenuAt(event.clientX, event.clientY);
  });

  document.addEventListener('pointerdown', (event) => {
    if (menu.hidden) return;
    if (!menu.contains(event.target)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  requestAnimationFrame(() => {
    clampPan();
    applyTransform();
  });

  return h('div', { class: 'map' }, viewport, legend);
}