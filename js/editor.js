import { h } from './util.js';
import { store, refLabel } from './store.js';
import { renderRich } from './richtext.js';
import { fuzzyRank } from './fuzzy.js';

const WORLD_LABELS = { real: 'реальный мир', afterlife: 'посмертие' };

const FORMAT_BUTTONS = [
  { id: 'bold', label: 'Ж', title: 'Жирный', run: (area) => toggleWrap(area, '**') },
  { id: 'italic', label: 'К', title: 'Курсив', run: (area) => toggleWrap(area, '*') },
  { id: 'heading', label: 'Н', title: 'Заголовок', run: (area) => toggleLinePrefix(area, '# ') },
  { id: 'list', label: '•', title: 'Список', run: (area) => toggleLinePrefix(area, '- ') },
  { id: 'quote', label: '❝', title: 'Цитата', run: (area) => toggleLinePrefix(area, '> ') },
];

function commit(area, value, start, end) {
  area.value = value;
  area.focus();
  area.setSelectionRange(start, end);
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

function toggleWrap(area, mark) {
  const { value, selectionStart: start, selectionEnd: end } = area;
  const before = value.slice(0, start);
  const inner = value.slice(start, end);
  const after = value.slice(end);
  const single = mark.length === 1;
  const outside =
    before.endsWith(mark) &&
    after.startsWith(mark) &&
    !(single && (before.endsWith('**') || after.startsWith('**')));
  const inside =
    inner.length > mark.length * 2 &&
    inner.startsWith(mark) &&
    inner.endsWith(mark) &&
    !(single && (inner.startsWith('**') || inner.endsWith('**')));

  if (outside) {
    commit(area, before.slice(0, -mark.length) + inner + after.slice(mark.length), start - mark.length, end - mark.length);
  } else if (inside) {
    commit(area, before + inner.slice(mark.length, -mark.length) + after, start, end - mark.length * 2);
  } else {
    commit(area, before + mark + inner + mark + after, start + mark.length, end + mark.length);
  }
}

function toggleLinePrefix(area, prefix) {
  const { value, selectionStart: start, selectionEnd: end } = area;
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const found = value.indexOf('\n', end);
  const lineEnd = found === -1 ? value.length : found;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const remove = lines.every((line) => line.startsWith(prefix));
  const next = lines.map((line) => {
    if (remove) return line.slice(prefix.length);
    return line.startsWith(prefix) ? line : prefix + line;
  });
  const text = next.join('\n');
  const firstShift = next[0].length - lines[0].length;
  commit(
    area,
    value.slice(0, lineStart) + text + value.slice(lineEnd),
    Math.max(lineStart, start + firstShift),
    Math.max(lineStart, end + text.length - (lineEnd - lineStart))
  );
}

const MIRROR_PROPS = [
  'boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
  'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
  'borderLeftWidth', 'tabSize',
];

function caretCoords(area, index) {
  const style = getComputedStyle(area);
  const mirror = document.createElement('div');
  for (const prop of MIRROR_PROPS) mirror.style[prop] = style[prop];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = area.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.append(marker);
  document.body.append(mirror);
  const result = { left: marker.offsetLeft, top: marker.offsetTop, height: marker.offsetHeight || 20 };
  mirror.remove();
  return result;
}

function openSearch({ text, self, currentWorld, onPick }) {
  const input = h('input', {
    type: 'search',
    class: 'rt-search-input',
    placeholder: 'Название записи',
    autocomplete: 'off',
  });
  input.value = text;
  const list = h('ul', { class: 'rt-search-list' }, h('li', { class: 'links-hint' }, 'Загрузка...'));
  const card = h(
    'div',
    { class: 'rt-search-card' },
    h('h3', {}, 'Искать в записях'),
    input,
    list,
    h('button', { type: 'button', class: 'rt-search-cancel', onClick: () => close() }, 'Отмена')
  );
  const overlay = h('div', { class: 'rt-search', role: 'dialog', 'aria-modal': 'true' }, card);
  let entries = [];

  function draw() {
    const ranked = fuzzyRank(entries, input.value, (entry) => entry.name);
    if (!ranked.length) {
      list.replaceChildren(h('li', { class: 'links-hint' }, 'Ничего не найдено'));
      return;
    }
    list.replaceChildren(
      ...ranked.map((entry) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                close();
                onPick(entry);
              },
            },
            h('span', { class: 'related-kind' }, refLabel(entry)),
            h('span', { class: 'related-name' }, entry.name),
            entry.world && entry.world !== currentWorld
              ? h('span', { class: 'rt-world' }, WORLD_LABELS[entry.world] ?? entry.world)
              : null
          )
        )
      )
    );
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  }

  input.addEventListener('input', draw);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      list.querySelector('button')?.click();
    }
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  input.focus();
  input.select();

  store
    .all()
    .then((items) => {
      entries = items
        .filter((entry) => `${entry.table}:${entry.id}` !== self)
        .sort((a, b) => Number(b.world === currentWorld) - Number(a.world === currentWorld));
      draw();
    })
    .catch((error) => {
      console.error(error);
      list.replaceChildren(h('li', { class: 'links-hint' }, 'Не удалось загрузить записи'));
    });
}

export function createRichField(field, prefill, hooks = {}) {
  const floating = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const currentWorld = document.body.dataset.world === 'afterlife' ? 'afterlife' : 'real';

  const textarea = h('textarea', {
    class: 'rt-input',
    name: field.name,
    rows: field.rows ?? 4,
    maxlength: field.maxLength ?? null,
  });
  textarea.value = prefill[field.name] ?? '';

  const preview = h('div', { class: 'rt-preview', hidden: true });
  const bar = h('div', {
    class: `rt-bar ${floating ? 'is-floating' : 'is-static'}`,
    role: 'toolbar',
    'aria-label': 'Форматирование',
    hidden: floating,
  });

  for (const item of FORMAT_BUTTONS) {
    bar.append(
      h(
        'button',
        {
          type: 'button',
          class: `rt-btn rt-btn-${item.id}`,
          title: item.title,
          'aria-label': item.title,
          onClick: () => item.run(textarea),
        },
        item.label
      )
    );
  }

  bar.append(h('button', { type: 'button', class: 'rt-btn rt-btn-search', onClick: startSearch }, 'Искать в записях'));
  bar.addEventListener('pointerdown', (event) => event.preventDefault());
  bar.addEventListener('mousedown', (event) => event.preventDefault());

  function startSearch() {
    const value = textarea.value;
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    if (start === end) {
      const isWord = (char) => /[\p{L}\p{N}-]/u.test(char ?? '');
      while (start > 0 && isWord(value[start - 1])) start -= 1;
      while (end < value.length && isWord(value[end])) end += 1;
    }
    const text = value.slice(start, end).replace(/[\[\]|\n]/g, ' ').trim();
    openSearch({
      text,
      self: hooks.self ?? null,
      currentWorld,
      onPick: (entry) => insertLink(start, end, text, entry),
    });
  }

  function insertLink(start, end, text, entry) {
    const markup = `[[${text || entry.name}|${entry.table}:${entry.id}]]`;
    const value = textarea.value;
    const caret = start + markup.length;
    commit(textarea, value.slice(0, start) + markup + value.slice(end), caret, caret);
    hooks.onLinkPicked?.(entry);
  }

  function place() {
    if (!floating) return;
    const collapsed = textarea.selectionStart === textarea.selectionEnd;
    if (collapsed || document.activeElement !== textarea || textarea.hidden) {
      bar.hidden = true;
      return;
    }
    const rect = textarea.getBoundingClientRect();
    const caret = caretCoords(textarea, textarea.selectionStart);
    const y = rect.top + caret.top - textarea.scrollTop;
    if (y < rect.top - caret.height || y > rect.bottom) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    let top = y - height - 8;
    if (top < 8) top = y + caret.height + 8;
    const left = Math.min(
      Math.max(rect.left + caret.left - textarea.scrollLeft, 8),
      window.innerWidth - width - 8
    );
    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
  }

  if (floating) {
    textarea.addEventListener('select', place);
    textarea.addEventListener('keyup', place);
    textarea.addEventListener('input', place);
    textarea.addEventListener('scroll', place);
    textarea.addEventListener('mouseup', () => setTimeout(place, 0));
    textarea.addEventListener('blur', () => {
      bar.hidden = true;
    });
    const onScroll = () => {
      if (!textarea.isConnected) {
        document.removeEventListener('scroll', onScroll, true);
        return;
      }
      place();
    };
    document.addEventListener('scroll', onScroll, true);
  }

  const editButton = h('button', { type: 'button', 'aria-pressed': 'true', onClick: () => setMode(false) }, 'Правка');
  const viewButton = h('button', { type: 'button', 'aria-pressed': 'false', onClick: () => setMode(true) }, 'Просмотр');

  function setMode(view) {
    editButton.setAttribute('aria-pressed', String(!view));
    viewButton.setAttribute('aria-pressed', String(view));
    textarea.hidden = view;
    preview.hidden = !view;
    if (view) {
      preview.replaceChildren(renderRich(textarea.value));
      bar.hidden = true;
    } else {
      bar.hidden = floating;
      textarea.focus();
    }
  }

  const head = h(
    'div',
    { class: 'rt-head' },
    h('span', {}, field.label),
    h('div', { class: 'segmented rt-modes', role: 'group', 'aria-label': 'Режим' }, editButton, viewButton)
  );

  const group = h('div', { class: 'field-group rt-field', id: `field-${field.name}` }, head, bar, textarea, preview);
  group.getValue = () => textarea.value;
  return group;
}