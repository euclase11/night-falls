import { supabase } from './supabase.js';
import { config } from './config.js';
import { h } from './util.js';
import { renderEntryDetails, renderSkeleton } from './render.js';
import { TABS } from './tabs/index.js';
import { store, invalidateCache } from './store.js';
import { editEntry, deleteEntry, moveEvent } from './addEntry.js';
import { destroyMapView } from './map.js';
import { loader } from './loader.js';

const DEFAULT_TAB = 'timeline';

const els = {
  title: document.getElementById('site-title'),
  worldSwitch: document.getElementById('world-switch'),
  tabs: document.getElementById('tabs'),
  toolbar: document.getElementById('toolbar'),
  search: document.getElementById('search'),
  subcontrols: document.getElementById('subcontrols'),
  view: document.getElementById('view'),
  sheet: document.getElementById('sheet'),
  sheetBody: document.getElementById('sheet-body'),
  sheetClose: document.getElementById('sheet-close'),
};

function readSetting(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

const sheetResizer = h('div', {
  class: 'sheet-resizer',
  role: 'separator',
  'aria-orientation': 'vertical',
  'aria-label': 'Изменить ширину карточки',
  title: 'Потяните, чтобы изменить ширину (двойной клик — сбросить)',
  hidden: true,
});
document.body.append(sheetResizer);

let sheetWidth = Number(readSetting('sheetWidth')) || 0;

function applySheetWidth(px) {
  const max = Math.round(window.innerWidth * 0.7);
  sheetWidth = Math.min(max, Math.max(320, Math.round(px)));
  document.documentElement.style.setProperty('--sheet-width', `${sheetWidth}px`);
}

if (sheetWidth) applySheetWidth(sheetWidth);

sheetResizer.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  sheetResizer.setPointerCapture(event.pointerId);
  sheetResizer.classList.add('is-active');
  document.body.classList.add('is-resizing');
});

sheetResizer.addEventListener('pointermove', (event) => {
  if (!sheetResizer.hasPointerCapture(event.pointerId)) return;
  applySheetWidth(window.innerWidth - event.clientX);
});

function stopResize(event) {
  if (!sheetResizer.hasPointerCapture(event.pointerId)) return;
  sheetResizer.releasePointerCapture(event.pointerId);
  sheetResizer.classList.remove('is-active');
  document.body.classList.remove('is-resizing');
  writeSetting('sheetWidth', String(sheetWidth));
}

sheetResizer.addEventListener('pointerup', stopResize);
sheetResizer.addEventListener('pointercancel', stopResize);

sheetResizer.addEventListener('dblclick', () => {
  sheetWidth = 0;
  document.documentElement.style.removeProperty('--sheet-width');
  writeSetting('sheetWidth', '');
});

const state = {
  tab: DEFAULT_TAB,
  world: readSetting('world') === 'afterlife' ? 'afterlife' : 'real',
  scope: 'global',
  kind: 'all',
  query: '',
};

let renderToken = 0;
let controlsToken = 0;
let sheetTrigger = null;
const sheetHistory = [];
let renderSkeletonTimer = null;

function tabFromHash() {
  const name = location.hash.replace('#', '');
  return Object.hasOwn(TABS, name) ? name : DEFAULT_TAB;
}

function emptyText() {
  return state.query.trim()
    ? 'Ничего не найдено. Попробуйте другой запрос.'
    : 'В этом мире пока нет записей.';
}

/* ---------- Контекст для табов ---------- */

const ctx = {
  onScopeChange(value) {
    state.scope = value;
    renderResults();
  },
  onKindChange(value) {
    state.kind = value;
    renderResults();
  },
  onSelectEntry(entry, trigger) {
    selectEntry(entry, trigger);
  },
  onReorder: moveEvent,
};

/* ---------- Chrome ---------- */

function renderChrome() {
  const tab = TABS[state.tab];
  document.body.dataset.world = state.world;
  els.worldSwitch.hidden = !tab.useWorld;
  els.toolbar.hidden = !tab.useSearch;
  els.search.placeholder = tab.placeholder;
  els.search.setAttribute('aria-label', tab.placeholder);
  els.worldSwitch.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.world === state.world));
  });
  els.tabs.querySelectorAll('button').forEach((button) => {
    if (button.dataset.tab === state.tab) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

/* ---------- Render ---------- */

/**
 * Отрисовать содержимое текущей вкладки.
 * @param {{ skeleton?: boolean }} opts
 *   skeleton: true — показывать скелетон (для переключения вкладок/мира),
 *   false/undefined — оставить старое содержимое и подсветить его как "занято" (поиск, фильтры).
 */
async function renderResults({ skeleton = false } = {}) {
  const token = ++renderToken;
  const isEmpty = els.view.children.length === 0;
  const useSkeleton = skeleton || isEmpty;

  clearTimeout(renderSkeletonTimer);

  if (useSkeleton) {
    els.view.replaceChildren(renderSkeleton());
  } else {
    els.view.classList.add('is-busy');
  }

  loader.start();

  try {
    const tab = TABS[state.tab];
    const items = await tab.load(state);
    if (token !== renderToken) return;

    clearTimeout(renderSkeletonTimer);
    els.view.classList.remove('is-busy');
    els.view.replaceChildren(tab.render(items, emptyText(), ctx));
  } catch (error) {
    if (token !== renderToken) return;

    clearTimeout(renderSkeletonTimer);
    els.view.classList.remove('is-busy');
    console.error(error);
    els.view.replaceChildren(
      h('p', { class: 'empty' }, 'Не удалось загрузить данные. Проверь соединение и попробуй ещё раз.'),
      h('p', { class: 'empty' }, `Подробности: ${error?.message || error}`),
      h('button', { type: 'button', class: 'rel-add', onClick: () => renderResults({ skeleton: true }) }, 'Повторить')
    );
  } finally {
    loader.stop();
  }
}

async function renderControls() {
  const token = ++controlsToken;
  els.subcontrols.replaceChildren();

  const tab = TABS[state.tab];
  if (!tab.renderControls) return;

  try {
    const node = await tab.renderControls(state, ctx);
    if (token !== controlsToken) return;
    if (node) els.subcontrols.append(node);
  } catch (error) {
    console.error(error);
  }
}

/* ---------- Боковая карточка (sheet) ---------- */

function markActive(entry) {
  const key = entry ? `${entry.table}:${entry.id}` : null;
  const id = entry ? String(entry.id) : null;
  els.view.querySelectorAll('[data-settlement], [data-entry]').forEach((node) => {
    const isActive =
      (node.dataset.settlement && entry?.table === 'settlements' && node.dataset.settlement === id) ||
      (node.dataset.entry && node.dataset.entry === key);
    node.classList.toggle('is-active', Boolean(isActive));
  });
}

let showToken = 0;

async function showEntry(entry) {
  const token = ++showToken;
  const favorites = await store.favorites();
  if (token !== showToken) return;
  els.sheetBody.replaceChildren(
    renderEntryDetails(entry, {
      canEdit: document.body.dataset.auth === 'in' && !entry.derived,
      isFavorite: favorites.has(`${entry.table}:${entry.id}`),
      onToggleFavorite: async () => {
        const value = await store.toggleFavorite(entry);
        if (TABS[state.tab].useFavorites) renderResults().then(() => markActive(entry));
        return value;
      },
      onOpen: (next) => {
        sheetHistory.push(entry);
        showEntry(next);
      },
      onBack: sheetHistory.length ? () => showEntry(sheetHistory.pop()) : null,
      onEdit: () => {
        closeSheet(false);
        editEntry(entry);
      },
      onDelete: async () => {
        if (await deleteEntry(entry)) closeSheet(false);
      },
    })
  );
  els.sheet.hidden = false;
  sheetResizer.hidden = false;
  els.sheet.scrollTop = 0;
  markActive(entry);
}

function selectEntry(entry, trigger) {
  sheetTrigger = trigger;
  sheetHistory.length = 0;
  showEntry(entry);
  els.sheetClose.focus();
}

function closeSheet(restoreFocus = true) {
  showToken += 1;
  if (els.sheet.hidden) return;
  els.sheet.hidden = true;
  sheetResizer.hidden = true;
  sheetHistory.length = 0;
  markActive(null);
  if (restoreFocus && sheetTrigger && sheetTrigger.isConnected) sheetTrigger.focus();
  sheetTrigger = null;
}

/* ---------- Вкладки ---------- */

function showTab(name) {
  destroyMapView();
  state.tab = name;
  state.query = '';
  state.kind = 'all';
  els.search.value = '';
  closeSheet(false);
  renderChrome();
  renderControls();
  renderResults({ skeleton: true });
}

/* ---------- События ---------- */

els.tabs.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (!button) return;
  if (location.hash === `#${button.dataset.tab}`) return;
  location.hash = button.dataset.tab;
});

els.worldSwitch.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-world]');
  if (!button || button.dataset.world === state.world) return;
  state.world = button.dataset.world;
  state.kind = 'all';
  writeSetting('world', state.world);
  renderChrome();
  renderControls();
  renderResults({ skeleton: true });
});

let searchTimer = null;

els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.search.value;
    renderResults();
  }, 200);
});

els.sheetClose.addEventListener('click', () => closeSheet());

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
});

window.addEventListener('hashchange', () => showTab(tabFromHash()));

document.addEventListener('data:updated', (event) => {
  const table = event.detail?.table;
  invalidateCache(table);
  closeSheet(false);
  renderControls();
  renderResults();
});

let lastSync = Date.now();

document.addEventListener('visibilitychange', () => {
  if (document.hidden || Date.now() - lastSync < 120000) return;
  lastSync = Date.now();
  invalidateCache();
  store.resetFavorites();
  store.favorites();
  renderControls();
  renderResults();
});

/* ---------- Старт ---------- */
let authUserId;

supabase.auth.onAuthStateChange((_event, session) => {
  const id = session?.user?.id ?? null;
  if (authUserId === undefined) {
    authUserId = id;
    return;
  }
  if (id === authUserId) return;
  authUserId = id;
  setTimeout(() => {
    store.resetFavorites();
    if (!id) closeSheet(false);
    store.favorites().then(() => {
      if (TABS[state.tab].useFavorites) renderResults();
    });
  }, 0);
});

store.favorites();

document.title = config.title;
els.title.textContent = config.title;
showTab(tabFromHash());