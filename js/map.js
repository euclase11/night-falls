// js/map.js
import { h, applyColor } from './util.js';
import { openForm } from './addEntry.js';
import { supabase } from './supabase.js';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.2;
const DRAG_THRESHOLD = 5;

function renderDot(settlement) {
  const dot = h('span', { class: 'dot' }, String(settlement.number ?? ''));
  applyColor(dot, settlement.color);
  return dot;
}

/**
 * Создаёт интерактивный вьюер карты.
 * @param {Array} settlements
 * @param {{ mapImage: string, mapAlt: string }} settings
 * @param {{ onSelect: (entry: any, trigger: HTMLElement) => void }} callbacks
 */
export function createMapView(settlements, settings, callbacks) {
  /* ---------- DOM ---------- */
  const stage = h('div', { class: 'map-stage' });
  const img = h('img', {
    class: 'map-image',
    src: settings.mapImage,
    alt: settings.mapAlt,
    draggable: 'false',
  });
  stage.append(img);

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

  /* ---------- Легенда ---------- */
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

  /* ---------- Состояние transform ---------- */
  const state = {
    scale: 1,
    tx: 0,
    ty: 0,
    isDown: false,
    isDragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
  };

  function applyTransform() {
    stage.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
  }

  function clampPan() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const sw = stage.offsetWidth * state.scale;
    const sh = stage.offsetHeight * state.scale;

    // По горизонтали
    if (sw <= vw) {
      state.tx = (vw - sw) / 2;
    } else {
      state.tx = Math.min(0, Math.max(vw - sw, state.tx));
    }

    // По вертикали
    if (sh <= vh) {
      state.ty = (vh - sh) / 2;
    } else {
      state.ty = Math.min(0, Math.max(vh - sh, state.ty));
    }
  }

  function zoomBy(factor, originX, originY) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const ox = originX ?? vw / 2;
    const oy = originY ?? vh / 2;

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

  /* ---------- Zoom колесом ---------- */
  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const ox = event.clientX - rect.left;
      const oy = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomBy(factor, ox, oy);
    },
    { passive: false }
  );

  /* ---------- Drag (pan) ---------- */
  viewport.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return; // только ЛКМ
    state.isDown = true;
    state.isDragging = false;
    state.moved = false;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.startTx = state.tx;
    state.startTy = state.ty;
  });

  window.addEventListener('mousemove', (event) => {
    if (!state.isDown) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (!state.isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      state.isDragging = true;
      state.moved = true;
      viewport.classList.add('is-panning');
    }

    if (state.isDragging) {
      state.tx = state.startTx + dx;
      state.ty = state.startTy + dy;
      clampPan();
      applyTransform();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!state.isDown) return;
    state.isDown = false;
    state.isDragging = false;
    viewport.classList.remove('is-panning');
    // Сбрасываем «moved» чуть позже, чтобы клик по маркеру не сработал после drag
    setTimeout(() => { state.moved = false; }, 0);
  });

  /* ---------- ПКМ: контекстное меню ---------- */
  const menu = h(
    'div',
    { class: 'map-menu', hidden: true },
    h('button', { type: 'button', class: 'map-menu-item' }, '+ Добавить поселение')
  );
  document.body.append(menu);

  function closeMenu() {
    menu.hidden = true;
  }

  viewport.addEventListener('contextmenu', async (event) => {
    event.preventDefault();

    // Проверим, вошла ли пользовательница — иначе меню не показываем
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Координаты клика в системе stage (без transform)
    const rect = viewport.getBoundingClientRect();
    const localX = (event.clientX - rect.left - state.tx) / state.scale;
    const localY = (event.clientY - rect.top - state.ty) / state.scale;

    // Переводим в проценты от размеров картинки
    const stageW = stage.offsetWidth;
    const stageH = stage.offsetHeight;
    const percentX = Math.max(0, Math.min(100, (localX / stageW) * 100));
    const percentY = Math.max(0, Math.min(100, (localY / stageH) * 100));

    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.hidden = false;

    // Обработчик кнопки — одноразовый
    const btn = menu.querySelector('.map-menu-item');
    const handler = () => {
      closeMenu();
      openForm('settlements', {
        x: Number(percentX.toFixed(2)),
        y: Number(percentY.toFixed(2)),
      });
    };
    btn.replaceWith(btn.cloneNode(true));
    menu.querySelector('.map-menu-item').addEventListener('click', handler);
  });

  document.addEventListener('mousedown', (event) => {
    if (menu.hidden) return;
    if (!menu.contains(event.target)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  // Первичная центровка
  requestAnimationFrame(() => {
    clampPan();
    applyTransform();
  });

  return h('div', { class: 'map' }, viewport, legend);
}