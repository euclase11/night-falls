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

function renderRelatedImages(urls) {
  if (!urls || !urls.length) return null;
  return h(
    'div',
    { class: 'related' },
    h('h3', {}, 'Изображения'),
    h(
      'div',
      { class: 'related-images' },
      urls.map((url) =>
        h('a', { href: url, target: '_blank', rel: 'noopener' }, h('img', { src: url, alt: '', loading: 'lazy' }))
      )
    )
  );
}

function renderRelatedLinks(keys, onOpen) {
  if (!keys || !keys.length) return null;
  const list = h('ul', { class: 'related-links' });
  const box = h('div', { class: 'related' }, h('h3', {}, 'Связано'), list);
  box.hidden = true;

  store
    .resolve(keys)
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

export function renderEntryDetails(entry, { canEdit = false, onOpen, onEdit, onDelete } = {}) {
  return h(
    'div',
    { class: 'entry-details' },
    entry.imageUrl
      ? h('img', { class: 'details-image', src: entry.imageUrl, alt: entry.name })
      : null,
    h('h2', {}, entry.name),
    entry.kind ? h('p', { class: 'details-kind' }, entry.kind) : null,
    entry.meta ? h('p', { class: 'details-meta' }, entry.meta) : null,
    h('p', {}, entry.description),
    renderRelatedImages(entry.images),
    renderRelatedLinks(entry.links, onOpen),
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