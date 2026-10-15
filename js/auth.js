// js/auth.js
import { supabase } from './supabase.js';

// --- Получаем элементы со страницы ---
const authForm      = document.getElementById('auth-form');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const logoutBtn     = document.getElementById('logout-btn');
const authMessage   = document.getElementById('auth-message');
const authContainer = document.getElementById('auth-container');

// --- Вспомогательные функции для сообщений ---
function showMessage(text, type = '') {
  if (!authMessage) return;
  authMessage.textContent = text;
  authMessage.classList.remove('is-error', 'is-success');
  if (type) authMessage.classList.add(type);
}

function clearMessage() {
  if (!authMessage) return;
  authMessage.textContent = '';
  authMessage.classList.remove('is-error', 'is-success');
}

// --- Вход ---
authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage('Введите email и пароль', 'is-error');
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showMessage('Ошибка входа: ' + error.message, 'is-error');
    return;
  }

  clearMessage();
  updateUI(data.user);
});

// --- Выход ---
logoutBtn?.addEventListener('click', async () => {
  clearMessage();
  const { error } = await supabase.auth.signOut();

  if (error) {
    showMessage('Ошибка выхода: ' + error.message, 'is-error');
    return;
  }

  updateUI(null);
});

// --- Проверка сессии при загрузке страницы ---
supabase.auth.getSession().then(({ data: { session } }) => {
  updateUI(session?.user ?? null);
});

// --- Следим за изменениями состояния входа ---
supabase.auth.onAuthStateChange((_event, session) => {
  updateUI(session?.user ?? null);
});

// --- Обновление интерфейса ---
function updateUI(user) {
  if (user) {
    if (authContainer) authContainer.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    document.body.dataset.auth = 'in';
    console.log('Вошёл пользователь:', user.email);
  } else {
    if (authContainer) authContainer.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    document.body.dataset.auth = 'out';
    console.log('Пользователь не авторизован');
  }
}