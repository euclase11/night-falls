import { supabase } from './supabase.js';
import { FORMS } from './forms.js';
import { store, REF_LABELS } from './store.js';
import { h } from './util.js';
import { deleteFiles, imageUrlsOf } from './upload.js';

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

let isLoggedIn = false;
let activeKey = null;
let editing = null;

function formKeyForTab(tabId) {
  return TAB_FORMS[tabId] ?? null;
}

function currentTabId() {
  return location.hash.replace('#', '') || 'timeline';
}

function renderLinksField(field, prefill) {
  const selected = new Set(Array.isArray(prefill[field.name]) ? prefill[field.name] : []);
  const self = editing ? `${editing.table}:${editing.id}` : null;

  const summary = h('summary', {});
  const filter = h('input', { type: 'search', class: 'links-filter', placeholder: 'Найти запись' });
  const list = h('ul', { class: 'links-list' }, h('li', { class: 'links-hint' }, 'Загрузка...'));
  const details = h('details', { class: 'links-picker' }, summary, filter, list);
  const group = h('div', { class: 'field-group', id: `field-${field.name}` }, h('span', {}, field.label), details);

  function updateSummary() {
    summary.textContent = selected.size ? `Выбрано: ${selected.size}` : 'Выбрать записи';
  }

  updateSummary();
  group.getValue = () => [...selected];

  filter.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
  });

  store
    .all()
    .then((items) => {
      const options = items
        .filter((entry) => `${entry.table}:${entry.id}` !== self)
        .map((entry) => ({
          key: `${entry.table}:${entry.id}`,
          label: `${REF_LABELS[entry.table]}: ${entry.name}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru'));

      const existing = new Set(options.map((option) => option.key));
      for (const key of [...selected]) {
        if (!existing.has(key)) selected.delete(key);
      }
      updateSummary();

      if (!options.length) {
        list.replaceChildren(h('li', { class: 'links-hint' }, 'Пока нет записей для связи'));
        return;
      }

      const rows = options.map((option) => {
        const checkbox = h('input', { type: 'checkbox' });
        checkbox.checked = selected.has(option.key);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected.add(option.key);
          else selected.delete(option.key);
          updateSummary();
        });
        const row = h('li', {}, h('label', {}, checkbox, option.label));
        row.dataset.text = option.label.toLowerCase().replaceAll('ё', 'е');
        return row;
      });
      list.replaceChildren(...rows);

      filter.addEventListener('input', () => {
        const needle = filter.value.toLowerCase().replaceAll('ё', 'е').trim();
        rows.forEach((row) => {
          row.hidden = needle !== '' && !row.dataset.text.includes(needle);
        });
      });
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

  function add(value, text) {
    select.append(h('option', { value }, text));
  }

  add(editing ? 'keep' : 'end', editing ? 'Оставить на месте' : 'В самый конец');

  wrapper.getValue = () => {
    const value = select.value;
    if (value.startsWith('after:')) return { mode: 'after', id: value.slice(6) };
    return { mode: value };
  };

  store
    .events()
    .then((events) => {
      const self = editing?.id;
      const sorted = events.filter((e) => e.id !== self).sort((a, b) => a.order - b.order);

      select.replaceChildren();
      if (editing) add('keep', 'Оставить на месте');
      add('start', 'В самое начало');
      for (const e of sorted) add(`after:${e.id}`, `После: ${e.name}${e.date ? ` (${e.date})` : ''}`);
      add('end', 'В самый конец');
      select.value = editing ? 'keep' : 'end';
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
}

function collectValues(config) {
  const values = {};
  for (const field of config.fields) {
    const node = fieldsEl.querySelector(`#field-${field.name}`);
    if (field.type === 'links' || field.type === 'images' || field.type === 'position') values[field.name] = node.getValue();
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
  if (entry) prefill = config.toValues ? config.toValues(entry.raw) : entry.raw;

  renderForm(config, prefill);
  section.hidden = false;
  openBtn.hidden = true;
  clearMessage();
  fieldsEl.querySelector('input, textarea, select')?.focus();
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function editEntry(entry) {
  if (!FORMS[entry.table]) return;
  openForm(entry.table, {}, entry);
}

async function removeReferences(entry) {
  const key = `${entry.table}:${entry.id}`;
  const all = await store.all();
  const referrers = all.filter((item) => item.links.includes(key));
  await Promise.all(
    referrers.map(async (item) => {
      const links = item.links.filter((value) => value !== key);
      const { error } = await supabase.from(item.table).update({ links }).eq('id', item.id);
      if (error) console.error(error);
    })
  );
}

export async function deleteEntry(entry) {
  if (!window.confirm(`Удалить «${entry.name}»?`)) return false;

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

  document.dispatchEvent(new CustomEvent('data:updated', { detail: { table: entry.table } }));
  return true;
}

function closeForm() {
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