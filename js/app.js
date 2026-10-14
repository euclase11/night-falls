// js/app.js
import { config } from './config.js';
import { store } from './store.js';
import { h, matchesQuery } from './util.js';
import { renderTimeline, renderEntries, renderMap, renderSettlementDetails, renderSegmented } from './render.js';

const TABS = {
  timeline: { useWorld: true, useSearch: true, placeholder: 'Поиск по событиям' },
  map: { useWorld: false, useSearch: false, placeholder: '' },
  characters: { useWorld: true, useSearch: true, placeholder: 'Поиск по персонажам' },
  other: { useWorld: true, useSearch: true, placeholder: 'Поиск по записям' }
};

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
  sheetClose: document.getElementById('sheet-close')
};

function readSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

const state = {
  tab: DEFAULT_TAB,
  world: readSetting('world') === 'afterlife' ? 'afterlife' : 'real',
  scope: 'global',
  kind: 'all',
  query: ''
};

let renderToken = 0;
let controlsToken = 0;
let sheetTrigger = null;

function tabFromHash() {
  const name = location.hash.replace('#', '');
  return Object.hasOwn(TABS, name) ? name : DEFAULT_TAB;
}

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

/* ---------- Загрузчики данных ---------- */

async function loadCharacters() {
  return store.characters();
}

async function loadOtherItems() {
  const [settlements, events, other] = await Promise.all([
    store.settlements(),
    store.events(),
    store.other(),
  ]);
  return [...settlements, ...events, ...other];
}

function emptyText() {
  return state.query.trim() ? 'Ничего не найдено. Попробуйте другой запрос.' : 'В этом мире пока нет записей.';
}

/* ---------- Построение вью ---------- */

async function buildView() {
  if (state.tab === 'map') {
    const settlements = await store.settlements();
    return renderMap(settlements, config, selectSettlement);
  }

  if (state.tab === 'timeline') {
    const events = await store.events();
    const visible = events
      .filter((event) => event.world === state.world && event.scope === state.scope)
      .filter((event) => matchesQuery(event, state.query, ['title', 'description', 'date']))
      .sort((a, b) => a.order - b.order);
    return renderTimeline(visible, emptyText());
  }

  const items = state.tab === 'characters' ? await loadCharacters() : await loadOtherItems();
  const visible = items
    .filter((item) => item.world === state.world)
    .filter((item) => state.tab !== 'other' || state.kind === 'all' || item.kind === state.kind)
    .filter((item) => matchesQuery(item, state.query, ['name', 'kind', 'meta', 'description', 'tags']))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return renderEntries(visible, emptyText());
}

async function renderResults() {
  const token = ++renderToken;
  try {
    const node = await buildView();
    if (token !== renderToken) return;
    els.view.replaceChildren(node);
  } catch (error) {
    if (token !== renderToken) return;
    console.error(error);
    els.view.replaceChildren(
      h(
        'p',
        { class: 'empty' },
        'Не удалось загрузить данные. Проверь подключение к Supabase и настройки RLS.'
      )
    );
  }
}

async function renderControls() {
  const token = ++controlsToken;
  els.subcontrols.replaceChildren();

  if (state.tab === 'timeline') {
    els.subcontrols.append(
      renderSegmented({
        options: [
          ['global', 'Глобальный сюжет'],
          ['local', 'Локальный сюжет']
        ],
        current: state.scope,
        label: 'Масштаб сюжета',
        className: 'segmented',
        onPick: (value) => {
          state.scope = value;
          renderResults();
        }
      })
    );
    return;
  }

  if (state.tab !== 'other') return;

  try {
    const items = await loadOtherItems();
    if (token !== controlsToken) return;
    const kinds = [...new Set(items.filter((item) => item.world === state.world).map((item) => item.kind))];
    els.subcontrols.append(
      renderSegmented({
        options: [['all', 'Все'], ...kinds.map((kind) => [kind, kind])],
        current: state.kind,
        label: 'Тип записи',
        className: 'chips',
        onPick: (value) => {
          state.kind = value;
          renderResults();
        }
      })
    );
  } catch (error) {
    console.error(error);
  }
}

/* ---------- Карта и боковая карточка ---------- */

function markActive(id) {
  els.view.querySelectorAll('[data-settlement]').forEach((node) => {
    node.classList.toggle('is-active', node.dataset.settlement === id);
  });
}

async function selectSettlement(id, trigger) {
  const settlements = await store.settlements();
  const settlement = settlements.find((item) => item.id === id);
  if (!settlement) return;
  sheetTrigger = trigger;
  els.sheetBody.replaceChildren(renderSettlementDetails(settlement));
  els.sheet.hidden = false;
  markActive(id);
  els.sheetClose.focus();
}

function closeSheet(restoreFocus = true) {
  if (els.sheet.hidden) return;
  els.sheet.hidden = true;
  markActive(null);
  if (restoreFocus && sheetTrigger && sheetTrigger.isConnected) sheetTrigger.focus();
  sheetTrigger = null;
}

/* ---------- Переключение вкладок ---------- */

function showTab(name) {
  state.tab = name;
  state.query = '';
  state.kind = 'all';
  els.search.value = '';
  closeSheet(false);
  renderChrome();
  renderControls();
  renderResults();
}

/* ---------- События UI ---------- */

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
  renderResults();
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

// Обновление списка персонажей после добавления через форму
document.addEventListener('characters:updated', () => {
  if (state.tab === 'characters') renderResults();
});

/* ---------- Старт ---------- */

document.title = config.title;
els.title.textContent = config.title;
showTab(tabFromHash());