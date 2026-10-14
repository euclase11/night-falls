// js/render.js
import { h, readableText } from './util.js';

function applyColor(node, color) {
  if (!color) return;
  node.style.setProperty('--marker-color', color);
  node.style.setProperty('--marker-ink', readableText(color));
}

function renderDot(settlement) {
  const dot = h('span', { class: 'dot' }, String(settlement.number ?? ''));
  applyColor(dot, settlement.color);
  return dot;
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

/* ---------- Карта ---------- */

export function renderMap(settlements, settings, onSelect) {
  const markers = settlements.map((s) => {
    const marker = h(
      'button',
      {
        type: 'button',
        class: 'marker',
        'aria-label': `${s.number ?? ''}. ${s.name}`,
        dataset: { settlement: String(s.id) },
      },
      String(s.number ?? '')
    );
    if (s.x != null) marker.style.left = `${s.x}%`;
    if (s.y != null) marker.style.top = `${s.y}%`;
    applyColor(marker, s.color);
    marker.addEventListener('click', () => onSelect(s, marker));
    return marker;
  });

  const legend = settlements.map((s) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: 'legend-item',
          dataset: { settlement: String(s.id) },
          onClick: (event) => onSelect(s, event.currentTarget),
        },
        renderDot(s),
        s.name
      )
    )
  );

  return h(
    'div',
    { class: 'map' },
    h(
      'div',
      { class: 'map-stage' },
      h('img', {
        class: 'map-image',
        src: settings.mapImage,
        alt: settings.mapAlt,
        draggable: 'false',
      }),
      markers
    ),
    h('ul', { class: 'map-legend' }, legend)
  );
}

/* ---------- Универсальный бланк записи ---------- */

export function renderEntryDetails(entry) {
  return h(
    'div',
    { class: 'entry-details' },
    entry.imageUrl
      ? h('img', { class: 'details-image', src: entry.imageUrl, alt: entry.name })
      : null,
    h('h2', {}, entry.name),
    entry.kind ? h('p', { class: 'details-kind' }, entry.kind) : null,
    entry.meta ? h('p', { class: 'details-meta' }, entry.meta) : null,
    h('p', {}, entry.description)
  );
}