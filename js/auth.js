// js/auth.js
import { supabase } from './supabase.js';

// --- Получаем элементы со страницы ---
const authForm     = document.getElementById('auth-form');
const emailInput   = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signupBtn    = document.getElementById('signup-btn');
const logoutBtn    = document.getElementById('logout-btn');
const authMessage  = document.getElementById('auth-message');
const authContainer = document.getElementById('auth-container');

// --- Вспомогательные функции для сообщений ---
function showMessage(text, type = '') {
  authMessage.textContent = text;
  authMessage.classList.remove('is-error', 'is-success');
  if (type) authMessage.classList.add(type);
}

function clearMessage() {
  authMessage.textContent = '';
  authMessage.classList.remove('is-error', 'is-success');
}

// --- Регистрация ---
signupBtn.addEventListener('click', async () => {
  clearMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage('Введите email и пароль', 'is-error');
    return;
  }

  if (password.length < 6) {
    showMessage('Пароль должен быть не короче 6 символов', 'is-error');
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    showMessage('Ошибка регистрации: ' + error.message, 'is-error');
    return;
  }

  // Если в Supabase включено подтверждение email — пользователь создан, но не вошёл
  if (data.user && !data.session) {
    showMessage('Аккаунт создан. Проверьте почту для подтверждения.', 'is-success');
  } else {
    showMessage('Аккаунт создан и выполнен вход!', 'is-success');
    updateUI(data.user);
  }
});

// --- Вход ---
authForm.addEventListener('submit', async (e) => {
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
logoutBtn.addEventListener('click', async () => {
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
    authContainer.style.display = 'none';
    logoutBtn.style.display = 'block';
    document.body.dataset.auth = 'in';   // удобно для CSS и других скриптов
    console.log('Вошёл пользователь:', user.email);
  } else {
    authContainer.style.display = 'block';
    logoutBtn.style.display = 'none';
    document.body.dataset.auth = 'out';
    console.log('Пользователь не авторизован');
  }
}