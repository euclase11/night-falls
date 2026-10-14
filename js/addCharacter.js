// js/addCharacter.js
import { supabase } from './supabase.js';

const form = document.getElementById('character-form');
const openBtn = document.getElementById('open-character-form');
const cancelBtn = document.getElementById('char-cancel');
const message = document.getElementById('char-message');
const section = document.getElementById('add-character');

const nameInput = document.getElementById('char-name');
const descInput = document.getElementById('char-desc');
const worldSelect = document.getElementById('char-world');
const imageInput = document.getElementById('char-image');
const submitBtn = document.getElementById('char-submit');

// --- Показ/скрытие формы ---
openBtn?.addEventListener('click', () => {
  section.hidden = false;
  openBtn.hidden = true;
  clearMessage();
  nameInput.focus();
});

cancelBtn?.addEventListener('click', () => {
  section.hidden = true;
  openBtn.hidden = false;
  form.reset();
  clearMessage();
});

// --- Вспомогательные ---
function showMessage(text, type = '') {
  message.textContent = text;
  message.classList.remove('is-error', 'is-success');
  if (type) message.classList.add(type);
}

function clearMessage() {
  message.textContent = '';
  message.classList.remove('is-error', 'is-success');
}

// --- Отслеживаем вход ---
supabase.auth.getSession().then(({ data: { session } }) => {
  toggleAddButton(!!session);
});

supabase.auth.onAuthStateChange((_event, session) => {
  toggleAddButton(!!session);
});

function toggleAddButton(isLoggedIn) {
  if (!openBtn || !section) return;
  openBtn.hidden = !isLoggedIn;
  if (!isLoggedIn) {
    section.hidden = true;
    form.reset();
    clearMessage();
  }
}

// --- Загрузка картинки ---
async function uploadImage(file) {
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `characters/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Конвертируем File в ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from('images')
    .upload(fileName, arrayBuffer, {
      contentType: file.type,   // явно указываем тип
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from('images').getPublicUrl(fileName);
  return data.publicUrl;
}
// --- Отправка формы ---
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const name = nameInput.value.trim();
  const description = descInput.value.trim();
  const world = worldSelect.value;
  const file = imageInput.files[0];

  if (!name) {
    showMessage('Введите имя персонажа', 'is-error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Сохраняем...';

  try {
    let imageUrl = null;

    if (file) {
      if (!file.type.startsWith('image/')) {
        throw new Error('Файл должен быть изображением');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Картинка больше 5 МБ — выбери поменьше');
      }
      imageUrl = await uploadImage(file);
    }

    const { error } = await supabase.from('characters').insert({
      name,
      description,
      world,
      image_url: imageUrl,
    });

    if (error) throw error;

    showMessage('Персонаж добавлен!', 'is-success');
    form.reset();

    setTimeout(() => {
      section.hidden = true;
      openBtn.hidden = false;
      clearMessage();
      document.dispatchEvent(new CustomEvent('characters:updated'));
    }, 900);

  } catch (err) {
    console.error(err);
    showMessage('Ошибка: ' + (err.message || err), 'is-error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Сохранить';
  }
});