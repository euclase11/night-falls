import { h } from './util.js';
import { renderRich } from './richtext.js';

const button = document.getElementById('help-btn');
const panel = document.getElementById('help');
const body = document.getElementById('help-body');
const closeButton = document.getElementById('help-close');

let loaded = false;

async function load() {
  if (loaded) return;
  body.replaceChildren(h('p', { class: 'empty' }, 'Загрузка...'));
  try {
    const response = await fetch('README.md', { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    body.replaceChildren(renderRich(await response.text()));
    loaded = true;
  } catch (error) {
    console.error(error);
    body.replaceChildren(h('p', { class: 'empty' }, 'Не удалось загрузить инструкцию.'));
  }
}

function open() {
  panel.hidden = false;
  load();
  closeButton.focus();
}

function close() {
  panel.hidden = true;
  button.focus();
}

button?.addEventListener('click', open);
closeButton?.addEventListener('click', close);
panel?.addEventListener('click', (event) => {
  if (event.target === panel) close();
});
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.stopPropagation();
      close();
    }
  },
  true
);