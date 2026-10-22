import { supabase } from './supabase.js';
import { FORMS } from './forms.js';
import { store, refLabel } from './store.js';
import { h } from './util.js';
import { deleteFiles, imageUrlsOf } from './upload.js';
import { createRichField } from './editor.js';
import { renderRelationsField } from './relations.js';
import { hasLinkKey, unlinkKey } from './richtext.js';
import { acquireLock, releaseLock, startHeartbeat, getLock, getCurrentUser } from './locks.js';

const section = document.getElementById('entry-form-section');
const formEl = document.getElementById('entry-form');
const titleEl = document.getElementById('entry-form-title');
const fieldsEl = document.getElementById('entry-form-fields');
const message = document.getElementById('entry-form-message');
const submitBtn = document.getElementById('entry-submit');
const cancelBtn = document.getElementById('entry-cancel');
const openBtn = document.getElementById('open-entry-form');

const TAB_FORMS = {
  characters: 'characters',
  timeline: 'events',
  map: 'settlements',
  other: 'misc',
  gallery: 'gallery',
};

const WORLD_LABELS = {
  real: 'реальный мир',
  afterlife: 'посмертие',
};

let isLoggedIn = false;
let activeKey = null;
let editing = null;
let dirty = false;
let activeLock = null;

function formKeyForTab(tabId) {
  return TAB_FORMS[tabId] ?? null;
}

function currentTabId() {
  return location.hash.replace('#', '') || 'timeline';
}

function renderLinksField(field, prefill) {
  const selected = new Set(Array.isArray(prefill[field.name]) ? prefill[field.name] : []);
  const self = editing ? `${editing.table}:${editing.id}` : null;
  const currentWorld = document.body.dataset.world === 'afterlife' ? 'afterlife' : 'real';

  const summary = h('summary', {});
  const filter = h('input', { type: 'search', class: 'links-filter', placeholder: 'Найти запись' });
  const otherWorld = h('input', { type: 'checkbox' });
  const otherWorldLabel = h('label', { class: 'links-toggle' }, otherWorld, 'Показывать записи из другого мира');
  const list = h('ul', { class: 'links-list' }, h('li', { class: 'links-hint' }, 'Загрузка...'));
  const details = h('details', { class: 'links-picker' }, summary, filter, otherWorldLabel, list);
  const group = h('div', { class: 'field-group', id: `field-${field.name}` }, h('span', {}, field.label), details);

  let rows = [];

  function updateSummary() {
    summary.textContent = selected.size ? `Выбрано: ${selected.size}` : 'Выбрать записи';
  }

  function applyFilters() {
    const needle = filter.value.toLowerCase().replaceAll('ё', 'е').trim();
    const showOther = otherWorld.checked;
    rows.forEach((item) => {
      const worldOk = showOther || !item.world || item.world === currentWorld || selected.has(item.key);
      const textOk = needle === '' || item.text.includes(needle);
      item.node.hidden = !(worldOk && textOk);
    });
  }

  updateSummary();
  group.getValue = () => [...selected];
  group.addKey = (key) => {
    selected.add(key);
    const row = rows.find((item) => item.key === key);
    if (row) row.checkbox.checked = true;
    updateSummary();
    applyFilters();
  };

  filter.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
  });
  filter.addEventListener('input', applyFilters);
  otherWorld.addEventListener('change', applyFilters);

  store
    .all()
    .then((items) => {
      const options = items
        .filter((entry) => `${entry.table}:${entry.id}` !== self)
        .map((entry) => {
          const base = `${refLabel(entry)}: ${entry.name}`;
          const foreign = entry.world && entry.world !== currentWorld;
          return {
            key: `${entry.table}:${entry.id}`,
            world: entry.world,
            base,
            label: foreign ? `${base} (${WORLD_LABELS[entry.world] ?? entry.world})` : base,
          };
        })
        .sort((a, b) => a.base.localeCompare(b.base, 'ru'));

      const existing = new Set(options.map((option) => option.key));
      for (const key of [...selected]) {
        if (!existing.has(key)) selected.delete(key);
      }
      updateSummary();

      if (!options.length) {
        list.replaceChildren(h('li', { class: 'links-hint' }, 'Пока нет записей для связи'));
        return;
      }

      rows = options.map((option) => {
        const checkbox = h('input', { type: 'checkbox' });
        checkbox.checked = selected.has(option.key);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected.add(option.key);
          else selected.delete(option.key);
          updateSummary();
        });
        const node = h('li', {}, h('label', {}, checkbox, option.label));
        return {
          node,
          key: option.key,
          world: option.world,
          text: option.base.toLowerCase().replaceAll('ё', 'е'),
          checkbox,
        };
      });

      list.replaceChildren(...rows.map((item) => item.node));
      applyFilters();
    })
    .catch((error) => {
      console.error(error);
      list.replaceChildren(h('li', { class: 'links-hint' }, 'Не удалось загрузить список'));
    });

  return group;
}

function renderPositionField(field) {
  const select = h('select', {});
  const wrapper = h('label', { id: `field-${field.name}` }, field.label, select);
  let worldSelect = null;
  let scopeSelect = null;
  let events = [];

  function add(value, text) {
    select.append(h('option', { value }, text));
  }

  function fill() {
    const world = worldSelect ? worldSelect.value : null;
    const scope = scopeSelect ? scopeSelect.value : null;
    const previous = select.value;
    const unchanged = editing && editing.raw.world === world && editing.raw.scope === scope;

    const sorted = events
      .filter((e) => e.id !== editing?.id)
      .filter((e) => (!world || e.world === world) && (!scope || e.scope === scope))
      .sort((a, b) => a.order - b.order);

    select.replaceChildren();
    if (unchanged) add('keep', 'Оставить на месте');
    add('start', 'В самое начало');
    for (const e of sorted) add(`after:${e.id}`, `После: ${e.name}${e.date ? ` (${e.date})` : ''}`);
    add('end', 'В самый конец');

    const values = [...select.options].map((option) => option.value);
    if (values.includes(previous)) select.value = previous;
    else select.value = unchanged ? 'keep' : 'end';
  }

  add(editing ? 'keep' : 'end', editing ? 'Оставить на месте' : 'В самый конец');

  wrapper.getValue = () => {
    const value = select.value;
    if (value.startsWith('after:')) return { mode: 'after', id: value.slice(6) };
    return { mode: value };
  };

  wrapper.bind = (world, scope) => {
    worldSelect = world;
    scopeSelect = scope;
    world?.addEventListener('change', fill);
    scope?.addEventListener('change', fill);
    fill();
  };

  store
    .events()
    .then((list) => {
      events = list;
      fill();
    })
    .catch(console.error);

  return wrapper;
}

function renderImagesField(field, prefill) {
  const keep = new Set(Array.isArray(prefill[field.name]) ? prefill[field.name] : []);
  const strip = h('div', { class: 'images-strip' });
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true });
  const group = h('div', { class: 'field-group', id: `field-${field.name}` }, h('span', {}, field.label), strip, input);

  function draw() {
    strip.replaceChildren(
      ...[...keep].map((url) =>
        h(
          'div',
          { class: 'images-item' },
          h('img', { src: url, alt: '' }),
          h(
            'button',
            {
              type: 'button',
              'aria-label': 'Убрать картинку',
              onClick: () => {
                keep.delete(url);
                draw();
                group.dispatchEvent(new Event('change', { bubbles: true }));
              },
            },
            h('span', { class: 'icon icon-close', 'aria-hidden': 'true' })
          )
        )
      )
    );
  }

  draw();
  group.getValue = () => ({ keep: [...keep], files: [...input.files] });
  return group;
}

function renderField(field, prefill = {}) {
  if (field.type === 'textarea' && field.rich) {
    const self = editing ? `${editing.table}:${editing.id}` : null;
    return createRichField(field, prefill, {
      self,
      onLinkPicked: (target) => {
        const links = fieldsEl.querySelector('#field-links');
        if (!links || !links.addKey) return;
        if (self && (target.links ?? []).includes(self)) return;
        links.addKey(`${target.table}:${target.id}`);
      },
    });
  }
  if (field.type === 'relations') {
    return renderRelationsField(field, {
      selfId: editing?.id ?? null,
      world: document.body.dataset.world === 'afterlife' ? 'afterlife' : 'real',
    });
  }
  if (field.type === 'position') return renderPositionField(field);
  if (field.type === 'links') return renderLinksField(field, prefill);
  if (field.type === 'images') return renderImagesField(field, prefill);

  const wrapper = document.createElement('label');
  wrapper.textContent = field.label;

  let input;
  switch (field.type) {
    case 'textarea':
      input = document.createElement('textarea');
      if (field.rows) input.rows = field.rows;
      break;

    case 'select': {
      input = document.createElement('select');
      for (const [value, label] of field.options) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        input.append(opt);
      }
      if (field.default) input.value = field.default;
      break;
    }

    case 'file':
      input = document.createElement('input');
      input.type = 'file';
      if (field.accept) input.accept = field.accept;
      break;

    case 'number':
      input = document.createElement('input');
      input.type = 'number';
      input.step = field.step ?? 'any';
      break;

    case 'color':
      input = document.createElement('input');
      input.type = 'color';
      input.value = field.default || '#ff5555';
      break;

    default:
      input = document.createElement('input');
      input.type = 'text';
  }

  input.id = `field-${field.name}`;
  input.name = field.name;
  if (field.required) input.required = true;
  if (field.maxLength) input.maxLength = field.maxLength;
  if (field.placeholder) input.placeholder = field.placeholder;

  if (field.type !== 'file' && prefill[field.name] != null && prefill[field.name] !== '') {
    if (field.type === 'color') {
      const candidate = String(prefill[field.name]).trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(candidate)) input.value = candidate;
    } else {
      input.value = prefill[field.name];
    }
  }

  wrapper.append(input);
  return wrapper;
}

function renderForm(config, prefill = {}) {
  titleEl.textContent = editing ? 'Редактирование' : config.title;
  fieldsEl.replaceChildren(...config.fields.map((field) => renderField(field, prefill)));

  const position = fieldsEl.querySelector('#field-position');
  if (position && position.bind) {
    position.bind(fieldsEl.querySelector('#field-world'), fieldsEl.querySelector('#field-scope'));
  }
}

function collectValues(config) {
  const values = {};
  for (const field of config.fields) {
    const node = fieldsEl.querySelector(`#field-${field.name}`);
    if (typeof node.getValue === 'function') values[field.name] = node.getValue();
    else if (field.type === 'file') values[field.name] = node.files[0] || null;
    else values[field.name] = node.value;
  }
  return values;
}

function updateButtonVisibility() {
  const key = formKeyForTab(currentTabId());
  const config = key ? FORMS[key] : null;
  const shouldShow = isLoggedIn && config;

  openBtn.hidden = !shouldShow || !section.hidden;
  if (shouldShow) openBtn.textContent = config.button;

  if (!shouldShow && !section.hidden) closeForm();
}

export function openForm(key, prefill = {}, entry = null) {
  const config = FORMS[key];
  if (!config) return;

  activeKey = key;
  editing = entry ? { id: entry.id, table: entry.table, raw: entry.raw } : null;

  if (entry) {
    // Редактирование: значения берём из самой записи
    prefill = config.toValues ? config.toValues(entry.raw) : entry.raw;
  } else {
    // Создание новой: по умолчанию подставляем мир, выбранный на сайте
    const currentWorld = document.body.dataset.world === 'afterlife' ? 'afterlife' : 'real';
    prefill = { ...prefill, world: prefill.world ?? currentWorld };
  }

  renderForm(config, prefill);
  dirty = false;
  section.hidden = false;
  openBtn.hidden = true;
  clearMessage();
  fieldsEl.querySelector('input, textarea, select')?.focus();
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export async function editEntry(entry) {
    if (!FORMS[entry.table]) return;
    if (entry.derived) return;

    const result = await acquireLock(entry.table, entry.id);
    if (!result.ok) {
        if (result.reason === 'locked') {
            const who = result.holder?.user_email || 'другой пользователь';
            window.alert(`Сейчас запись редактирует ${who}. Попробуйте позже.`);
        } else if (result.reason === 'no-session') {
            window.alert('Войдите, чтобы редактировать.');
        } else {
            window.alert('Не удалось получить блокировку. Попробуйте ещё раз.');
        }
        return;
    }

    if (activeLock) {
        activeLock.stop();
        await releaseLock(activeLock.table, activeLock.id);
        activeLock = null;
    }

    activeLock = {
        table: entry.table,
        id: entry.id,
        stop: startHeartbeat(entry.table, entry.id),
    };

    openForm(entry.table, {}, entry);
}

async function removeReferences(entry) {
  const key = `${entry.table}:${entry.id}`;
  const all = await store.all();
  const referrers = all.filter(
    (item) => item.raw && (item.links.includes(key) || hasLinkKey(item.raw.description, key))
  );
  await Promise.all(
    referrers.map(async (item) => {
      const patch = { links: item.links.filter((value) => value !== key) };
      if (hasLinkKey(item.raw.description, key)) patch.description = unlinkKey(item.raw.description, key);
      const { error } = await supabase.from(item.table).update(patch).eq('id', item.id);
      if (error) console.error(error);
    })
  );
}

export async function deleteEntry(entry) {
    if (!window.confirm(`Удалить «${entry.name}»?`)) return false;

    const lock = await getLock(entry.table, entry.id);
    if (lock) {
        const me = await getCurrentUser();
        if (lock.user_id !== me?.id) {
            const who = lock.user_email || 'другой пользователь';
            window.alert(`Нельзя удалить: сейчас запись редактирует ${who}.`);
            return false;
        }
    }

    const { data, error } = await supabase.from(entry.table).delete().eq('id', entry.id).select();
    if (error) {
        window.alert('Ошибка: ' + error.message);
        return false;
    }
    if (!data || !data.length) {
        window.alert('Не удалось удалить: нет прав или запись уже удалена.');
        return false;
    }

    await Promise.all([
        deleteFiles(imageUrlsOf(entry.raw)).catch(console.error),
        removeReferences(entry).catch(console.error),
    ]);

    document.dispatchEvent(new CustomEvent('data:updated'));
    return true;
}

export async function moveEvent(entry, order) {
  const { data, error } = await supabase
    .from('events')
    .update({ sort_order: order })
    .eq('id', entry.id)
    .select();

  if (error || !data || !data.length) {
    window.alert('Не удалось переместить: ' + (error?.message || 'нет прав'));
  }

  document.dispatchEvent(new CustomEvent('data:updated', { detail: { table: 'events' } }));
}

function closeForm() {
    if (activeLock) {
        activeLock.stop();
        releaseLock(activeLock.table, activeLock.id);
        activeLock = null;
    }
    dirty = false;
    section.hidden = true;
    formEl.reset();
    clearMessage();
    activeKey = null;
    editing = null;
    updateButtonVisibility();
}

function showMessage(text, type = '') {
  message.textContent = text;
  message.classList.remove('is-error', 'is-success');
  if (type) message.classList.add(type);
}

function clearMessage() {
  message.textContent = '';
  message.classList.remove('is-error', 'is-success');
}

supabase.auth.getSession().then(({ data: { session } }) => {
  isLoggedIn = !!session;
  updateButtonVisibility();
});

supabase.auth.onAuthStateChange((_event, session) => {
  isLoggedIn = !!session;
  updateButtonVisibility();
});

window.addEventListener('hashchange', updateButtonVisibility);

openBtn?.addEventListener('click', () => {
  const key = formKeyForTab(currentTabId());
  if (key) openForm(key);
});
cancelBtn?.addEventListener('click', closeForm);

const desktopQuery = window.matchMedia('(min-width: 48rem)');
let pressedOnOverlay = false;

function markDirty(event) {
  if (event.target.closest('.links-filter, .links-toggle')) return;
  dirty = true;
}

formEl.addEventListener('input', markDirty);
formEl.addEventListener('change', markDirty);

function requestClose() {
  if (submitBtn.disabled) return;
  if (dirty && !window.confirm('Закрыть без сохранения? Введённые данные пропадут.')) return;
  closeForm();
}

cancelBtn?.addEventListener('click', requestClose);

section.addEventListener('pointerdown', (event) => {
  pressedOnOverlay = event.target === section;
});

section.addEventListener('click', (event) => {
  if (desktopQuery.matches && pressedOnOverlay && event.target === section) requestClose();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !section.hidden) requestClose();
});

window.addEventListener('beforeunload', (event) => {
    if (activeLock) {
        releaseLock(activeLock.table, activeLock.id);
        activeLock = null;
    }
    if (!dirty || section.hidden) return;
    event.preventDefault();
    event.returnValue = '';
});

formEl?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const config = activeKey ? FORMS[activeKey] : null;
  if (!config) return;

  const values = collectValues(config);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Сохраняем...';

  try {
    const previous = editing?.raw;
    const row = await config.toRow(values, previous);
    const query = editing
      ? supabase.from(config.table).update(row).eq('id', editing.id)
      : supabase.from(config.table).insert(row);
    const { data, error } = await query.select();
    if (error) throw error;
    if (!data || !data.length) throw new Error('Нет прав на сохранение');

    if (previous) {
      const kept = new Set(imageUrlsOf(row));
      const removed = imageUrlsOf(previous).filter((url) => !kept.has(url));
      await deleteFiles(removed).catch(console.error);
    }

    try {
      await config.afterSave?.(data[0], values);
    } catch (relationError) {
      console.error(relationError);
      editing = { id: data[0].id, table: config.table, raw: data[0] };
      document.dispatchEvent(new CustomEvent('data:updated', { detail: { table: config.table } }));
      showMessage('Запись сохранена, но отношения не сохранились: ' + (relationError.message || relationError), 'is-error');
      return;
    }

    showMessage('Сохранено!', 'is-success');

    setTimeout(() => {
      closeForm();
      document.dispatchEvent(new CustomEvent('data:updated', { detail: { table: config.table } }));
    }, 800);
  } catch (err) {
    console.error(err);
    showMessage('Ошибка: ' + (err.message || err), 'is-error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Сохранить';
  }
});