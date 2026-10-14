// js/app.js
import { config } from './config.js';
import { h } from './util.js';
import { renderEntryDetails, renderSkeleton } from './render.js';
import { TABS } from './tabs/index.js';
import { store, invalidateCache } from './store.js';   // ← store уже не импортируется в app.js, но на всякий случай

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
      h('p', { class: 'empty' }, 'Не удалось загрузить данные. Проверь Supabase и RLS.')
    );
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

function markActive(id) {
  const idStr = id == null ? null : String(id);
  els.view.querySelectorAll('[data-settlement], [data-entry]').forEach((node) => {
    const isActive =
      (node.dataset.settlement && node.dataset.settlement === idStr) ||
      (node.dataset.entry && node.dataset.entry === idStr);
    node.classList.toggle('is-active', isActive);
  });
}

function selectEntry(entry, trigger) {
  sheetTrigger = trigger;
  els.sheetBody.replaceChildren(renderEntryDetails(entry));
  els.sheet.hidden = false;
  markActive(entry.id);
  els.sheetClose.focus();
}

function closeSheet(restoreFocus = true) {
  if (els.sheet.hidden) return;
  els.sheet.hidden = true;
  markActive(null);
  if (restoreFocus && sheetTrigger && sheetTrigger.isConnected) sheetTrigger.focus();
  sheetTrigger = null;
}

/* ---------- Вкладки ---------- */

function showTab(name) {
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

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  renderResults();
});

els.sheetClose.addEventListener('click', () => closeSheet());

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
});

window.addEventListener('hashchange', () => showTab(tabFromHash()));

document.addEventListener('data:updated', (event) => {
  const table = event.detail?.table;
  invalidateCache(table);           // сбросим кэш изменённой таблицы
  renderControls();
  renderResults();
});

/* ---------- Старт ---------- */

document.title = config.title;
els.title.textContent = config.title;
showTab(tabFromHash());