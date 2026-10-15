// js/render.js
import { h, readableText } from './util.js';
import { store, REF_LABELS } from './store.js';

function applyColor(node, color) {
  if (!color) return;
  node.style.setProperty('--marker-color', color);
  node.style.setProperty('--marker-ink', readableText(color));
}

function renderTags(tags) {
  if (!tags || !tags.length) return null;
  return h('ul', { class: 'tags' }, tags.map((tag) => h('li', {}, tag)));
}

function renderEmpty(text) {
  return h('p', { class: 'empty' }, text);
}

function renderThumbnail(url, alt) {
  if (!url) return null;
  return h('img', {
    class: 'entry-thumb',
    src: url,
    alt: alt ?? '',
    loading: 'lazy',
  });
}

/* ---------- Segmented (без изменений) ---------- */

export function renderSegmented({ options, current, label, className, onPick }) {
  const group = h('div', { class: className, role: 'group', 'aria-label': label });
  const buttons = options.map(([value, text]) => {
    const button = h('button', { type: 'button', 'aria-pressed': String(value === current) }, text);
    button.addEventListener('click', () => {
      buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      onPick(value);
    });
    return button;
  });
  group.append(...buttons);
  return group;
}

/* ---------- Таймлайн (кликабельные элементы) ---------- */

export function renderTimeline(events, emptyText, onSelect) {
  if (!events.length) return renderEmpty(emptyText);

  return h(
    'ol',
    { class: 'timeline' },
    events.map((event) => {
      const item = h(
        'li',
        {
          class: 'timeline-item' + (onSelect ? ' is-clickable' : ''),
          dataset: event.id ? { entry: String(event.id) } : {},
          tabindex: onSelect ? '0' : null,
          role: onSelect ? 'button' : null,
        },
        h('span', { class: 'timeline-date' }, event.date),
        h('h3', {}, event.title),
        h('p', {}, event.description)
      );

      if (onSelect) {
        item.addEventListener('click', () => onSelect(event, item));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(event, item);
          }
        });
      }

      return item;
    })
  );
}

/* ---------- Список карточек (кликабельные) ---------- */

export function renderEntries(items, emptyText, onSelect) {
  if (!items.length) return renderEmpty(emptyText);

  return h(
    'ul',
    { class: 'entries' },
    items.map((item) => {
      const node = h(
        'li',
        {
          class: 'entry' + (onSelect ? ' is-clickable' : '') + (item.imageUrl ? ' has-thumb' : ''),
          dataset: item.id ? { entry: String(item.id) } : {},
          tabindex: onSelect ? '0' : null,
          role: onSelect ? 'button' : null,
        },
        renderThumbnail(item.imageUrl, item.name),
        h(
          'div',
          { class: 'entry-head' },
          h('h3', {}, item.name),
          item.kind ? h('span', { class: 'entry-kind' }, item.kind) : null
        ),
        item.meta ? h('p', { class: 'entry-meta' }, item.meta) : null,
        h('p', {}, item.description),
        renderTags(item.tags)
      );

      if (onSelect) {
        node.addEventListener('click', () => onSelect(item, node));
        node.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(item, node);
          }
        });
      }

      return node;
    })
  );
}


/* ---------- Универсальный бланк записи ---------- */

function openLightbox(urls, startIndex = 0) {
  let index = startIndex;
  const img = h('img', { class: 'lightbox-image', alt: '' });
  const counter = h('span', { class: 'lightbox-counter' });
  const prev = h('button', { type: 'button', class: 'lightbox-nav lightbox-prev', 'aria-label': 'Предыдущее', onClick: () => show(index - 1) }, '‹');
  const next = h('button', { type: 'button', class: 'lightbox-nav lightbox-next', 'aria-label': 'Следующее', onClick: () => show(index + 1) }, '›');
  const closeBtn = h('button', { type: 'button', class: 'lightbox-close', 'aria-label': 'Закрыть', onClick: close }, '×');
  const overlay = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true' }, closeBtn, prev, img, next, counter);

  function show(i) {
    index = (i + urls.length) % urls.length;
    img.src = urls[index];
    counter.textContent = urls.length > 1 ? `${index + 1} / ${urls.length}` : '';
    prev.hidden = urls.length < 2;
    next.hidden = urls.length < 2;
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowLeft' && urls.length > 1) {
      show(index - 1);
    } else if (event.key === 'ArrowRight' && urls.length > 1) {
      show(index + 1);
    }
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  show(index);
  closeBtn.focus();
}

function renderRelatedImages(urls, gallery, offset) {
  if (!urls || !urls.length) return null;
  return h(
    'div',
    { class: 'related' },
    h('h3', {}, 'Изображения'),
    h(
      'div',
      { class: 'related-images' },
      urls.map((url, i) =>
        h(
          'button',
          { type: 'button', class: 'related-image', 'aria-label': 'Открыть изображение', onClick: () => openLightbox(gallery, offset + i) },
          h('img', { src: url, alt: '', loading: 'lazy' })
        )
      )
    )
  );
}

function renderRefList(title, load, onOpen) {
  const list = h('ul', { class: 'related-links' });
  const box = h('div', { class: 'related' }, h('h3', {}, title), list);
  box.hidden = true;

  load()
    .then((items) => {
      if (!items.length) return;
      list.replaceChildren(
        ...items.map((item) =>
          h(
            'li',
            {},
            h(
              'button',
              { type: 'button', onClick: () => onOpen?.(item) },
              h('span', { class: 'related-kind' }, REF_LABELS[item.table]),
              item.name
            )
          )
        )
      );
      box.hidden = false;
    })
    .catch(console.error);

  return box;
}

export function renderEntryDetails(entry, { canEdit = false, onOpen, onBack, onEdit, onDelete } = {}) {
  const related = entry.images ?? [];
  const gallery = [entry.imageUrl, ...related].filter(Boolean);
  const offset = entry.imageUrl ? 1 : 0;

  return h(
    'div',
    { class: 'entry-details' },
    onBack ? h('button', { type: 'button', class: 'details-back', onClick: onBack }, '← Назад') : null,
    entry.imageUrl
      ? h(
          'button',
          { type: 'button', class: 'details-image-button', 'aria-label': 'Открыть изображение', onClick: () => openLightbox(gallery, 0) },
          h('img', { class: 'details-image', src: entry.imageUrl, alt: entry.name })
        )
      : null,
    h('h2', {}, entry.name),
    entry.kind ? h('p', { class: 'details-kind' }, entry.kind) : null,
    entry.meta ? h('p', { class: 'details-meta' }, entry.meta) : null,
    h('p', {}, entry.description),
    renderRelatedImages(related, gallery, offset),
    entry.links && entry.links.length ? renderRefList('Связано', () => store.resolve(entry.links), onOpen) : null,
    renderRefList('Упоминается в', () => store.backlinks(entry), onOpen),
    canEdit
      ? h(
          'div',
          { class: 'details-actions' },
          h('button', { type: 'button', onClick: onEdit }, 'Редактировать'),
          h('button', { type: 'button', class: 'danger', onClick: onDelete }, 'Удалить')
        )
      : null
  );
}

export function renderGallery(items, emptyText, onSelect) {
  if (!items.length) return renderEmpty(emptyText);

  return h(
    'ul',
    { class: 'gallery' },
    items.map((item) => {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'gallery-item',
          dataset: item.id ? { entry: String(item.id) } : {},
          onClick: () => onSelect(item, button),
        },
        h('img', { src: item.imageUrl, alt: item.name, loading: 'lazy' }),
        h('span', {}, item.name)
      );
      return h('li', {}, button);
    })
  );
}

/* ---------- Скелетон загрузки ---------- */

export function renderSkeleton(count = 4) {
  return h(
    'ul',
    { class: 'skeleton', 'aria-hidden': 'true' },
    Array.from({ length: count }, () =>
      h(
        'li',
        { class: 'skeleton-item' },
        h('div', { class: 'skeleton-bar w-40' }),
        h('div', { class: 'skeleton-bar w-90' }),
        h('div', { class: 'skeleton-bar w-60' })
      )
    )
  );
}