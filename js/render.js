import { h, readableText } from './util.js';

function applyColor(node, color) {
  node.style.setProperty('--marker-color', color);
  node.style.setProperty('--marker-ink', readableText(color));
}

function renderDot(settlement) {
  const dot = h('span', { class: 'dot' }, String(settlement.number));
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

export function renderTimeline(events, emptyText) {
  if (!events.length) return renderEmpty(emptyText);
  return h(
    'ol',
    { class: 'timeline' },
    events.map((event) =>
      h(
        'li',
        { class: 'timeline-item' },
        h('span', { class: 'timeline-date' }, event.date),
        h('h3', {}, event.title),
        h('p', {}, event.description)
      )
    )
  );
}

export function renderEntries(items, emptyText) {
  if (!items.length) return renderEmpty(emptyText);
  return h(
    'ul',
    { class: 'entries' },
    items.map((item) =>
      h(
        'li',
        { class: 'entry' },
        h('div', { class: 'entry-head' }, h('h3', {}, item.name), item.kind ? h('span', { class: 'entry-kind' }, item.kind) : null),
        item.meta ? h('p', { class: 'entry-meta' }, item.meta) : null,
        h('p', {}, item.description),
        renderTags(item.tags)
      )
    )
  );
}

export function renderMap(settlements, settings, onSelect) {
  const markers = settlements.map((settlement) => {
    const marker = h(
      'button',
      {
        type: 'button',
        class: 'marker',
        'aria-label': `${settlement.number}. ${settlement.name}`,
        dataset: { settlement: settlement.id },
        onClick: (event) => onSelect(settlement.id, event.currentTarget)
      },
      String(settlement.number)
    );
    marker.style.left = `${settlement.x}%`;
    marker.style.top = `${settlement.y}%`;
    applyColor(marker, settlement.color);
    return marker;
  });

  const legend = settlements.map((settlement) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: 'legend-item',
          dataset: { settlement: settlement.id },
          onClick: (event) => onSelect(settlement.id, event.currentTarget)
        },
        renderDot(settlement),
        settlement.name
      )
    )
  );

  return h(
    'div',
    { class: 'map' },
    h(
      'div',
      { class: 'map-stage' },
      h('img', { class: 'map-image', src: settings.mapImage, alt: settings.mapAlt, draggable: 'false' }),
      markers
    ),
    h('ul', { class: 'map-legend' }, legend)
  );
}

export function renderSettlementDetails(settlement) {
  return h('div', {}, renderDot(settlement), h('h2', {}, settlement.name), h('p', {}, settlement.description));
}
