// js/addEntry.js
import { supabase } from './supabase.js';
import { FORMS } from './forms.js';

const section = document.getElementById('entry-form-section');
const formEl = document.getElementById('entry-form');
const titleEl = document.getElementById('entry-form-title');
const fieldsEl = document.getElementById('entry-form-fields');
const message = document.getElementById('entry-form-message');
const submitBtn = document.getElementById('entry-submit');
const cancelBtn = document.getElementById('entry-cancel');
const openBtn = document.getElementById('open-entry-form');

let isLoggedIn = false;

/** Какой тип формы соответствует текущей вкладке. */
function formKeyForTab(tabId) {
  switch (tabId) {
    case 'characters': return 'characters';
    case 'timeline':   return 'events';
    case 'map':        return 'settlements';
    // 'other' — форма не показывается, добавлять можно на соответствующих вкладках
    default: return null;
  }
}

function currentTabId() {
  return location.hash.replace('#', '') || 'timeline';
}

/* ---------- Рендер полей ---------- */

function renderField(field) {
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

  wrapper.append(input);
  return wrapper;
}

function renderForm(config) {
  titleEl.textContent = config.title;
  fieldsEl.replaceChildren(...config.fields.map(renderField));
}

function collectValues(config) {
  const values = {};
  for (const field of config.fields) {
    const input = fieldsEl.querySelector(`#field-${field.name}`);
    values[field.name] = field.type === 'file' ? input.files[0] || null : input.value;
  }
  return values;
}

/* ---------- Видимость кнопки ---------- */

function updateButtonVisibility() {
  const key = formKeyForTab(currentTabId());
  const config = key ? FORMS[key] : null;
  const shouldShow = isLoggedIn && config;

  openBtn.hidden = !shouldShow;
  if (shouldShow) openBtn.textContent = config.button;

  if (!shouldShow && !section.hidden) closeForm();
}

/* ---------- Открыть/закрыть ---------- */

function openForm() {
  const key = formKeyForTab(currentTabId());
  const config = key ? FORMS[key] : null;
  if (!config) return;

  renderForm(config);
  section.hidden = false;
  openBtn.hidden = true;
  clearMessage();
  fieldsEl.querySelector('input, textarea, select')?.focus();
}

function closeForm() {
  section.hidden = true;
  formEl.reset();
  clearMessage();
  updateButtonVisibility();
}

/* ---------- Сообщения ---------- */

function showMessage(text, type = '') {
  message.textContent = text;
  message.classList.remove('is-error', 'is-success');
  if (type) message.classList.add(type);
}

function clearMessage() {
  message.textContent = '';
  message.classList.remove('is-error', 'is-success');
}

/* ---------- Вход ---------- */

supabase.auth.getSession().then(({ data: { session } }) => {
  isLoggedIn = !!session;
  updateButtonVisibility();
});

supabase.auth.onAuthStateChange((_event, session) => {
  isLoggedIn = !!session;
  updateButtonVisibility();
});

/* ---------- Смена вкладки ---------- */

window.addEventListener('hashchange', updateButtonVisibility);

/* ---------- Кнопки ---------- */

openBtn?.addEventListener('click', openForm);
cancelBtn?.addEventListener('click', closeForm);

/* ---------- Отправка ---------- */

formEl?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const key = formKeyForTab(currentTabId());
  const config = key ? FORMS[key] : null;
  if (!config) return;

  const values = collectValues(config);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Сохраняем...';

  try {
    const row = await config.toRow(values);
    const { error } = await supabase.from(config.table).insert(row);
    if (error) throw error;

    showMessage('Сохранено!', 'is-success');
    formEl.reset();

    setTimeout(() => {
      closeForm();
      // app.js слушает это событие и перерисовывает активную вкладку
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