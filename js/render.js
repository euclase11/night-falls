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

export function renderCollapsible(content, rows = 2) {
  let expanded = false;
  let checked = false;
  const toggle = h('button', { type: 'button', class: 'chips-toggle' });
  const wrap = h('div', { class: 'chips-wrap' }, content, toggle);

  function update(overflow) {
    wrap.classList.toggle('is-collapsed', overflow && !expanded);
    toggle.hidden = !overflow;
    toggle.textContent = expanded ? 'Свернуть' : 'Показать все';
    toggle.setAttribute('aria-expanded', String(expanded));
  }

  function measure() {
    const first = content.querySelector('button');
    if (!first || !first.offsetHeight) return;
    const gap = parseFloat(getComputedStyle(content).rowGap) || 0;
    const max = first.offsetHeight * rows + gap * (rows - 1);
    content.style.setProperty('--chips-max', `${max}px`);
    const overflow = content.scrollHeight > max + 1;

    if (!checked) {
      checked = true;
      const active = content.querySelector('[aria-pressed="true"]');
      if (active) {
        const top = active.getBoundingClientRect().top - content.getBoundingClientRect().top;
        if (top >= max) expanded = true;
      }
    }

    update(overflow);
  }

  toggle.addEventListener('click', () => {
    expanded = !expanded;
    update(true);
  });

  new ResizeObserver(() => requestAnimationFrame(measure)).observe(wrap);
  return wrap;
}

/* ---------- Таймлайн (кликабельные элементы) ---------- */

let reordering = false;
let suppressClickUntil = 0;

document.addEventListener(
  'touchmove',
  (event) => {
    if (reordering) event.preventDefault();
  },
  { passive: false }
);

const LONG_PRESS_MS = 450;
const MOVE_CANCEL = 10;
const EDGE_ZONE = 70;

function enableReorder(list, item, eventByNode, onReorder) {
  let timer = null;
  let dragging = false;
  let pressX = 0;
  let pressY = 0;
  let dragStartY = 0;
  let startScroll = 0;
  let lastY = 0;
  let nodes = [];
  let rects = [];
  let fromIndex = 0;
  let dragHeight = 0;
  let currentTarget = 0;
  let scrollFrame = 0;

  function targetIndex() {
    const pointer = lastY + window.scrollY;
    let target = 0;
    rects.forEach((rect, index) => {
      if (index !== fromIndex && rect.mid < pointer) target += 1;
    });
    return target;
  }

  function applyShifts(target) {
    nodes.forEach((node, index) => {
      if (index === fromIndex) return;
      const position = index < fromIndex ? index : index - 1;
      let shift = 0;
      if (index < fromIndex && position >= target) shift = dragHeight;
      else if (index > fromIndex && position < target) shift = -dragHeight;
      node.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function follow() {
    const delta = lastY + window.scrollY - (dragStartY + startScroll);
    item.style.transform = `translateY(${delta}px)`;
    currentTarget = targetIndex();
    applyShifts(currentTarget);
  }

  function autoScroll() {
    if (!dragging) return;
    const bottom = window.innerHeight - lastY;
    let delta = 0;
    if (lastY < EDGE_ZONE) delta = -Math.ceil((EDGE_ZONE - lastY) / 6);
    else if (bottom < EDGE_ZONE) delta = Math.ceil((EDGE_ZONE - bottom) / 6);
    if (delta) {
      window.scrollBy(0, delta);
      follow();
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function startDrag() {
    dragging = true;
    reordering = true;
    nodes = [...list.children];
    fromIndex = nodes.indexOf(item);
    rects = nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { mid: rect.top + window.scrollY + rect.height / 2 };
    });
    dragHeight = item.getBoundingClientRect().height;
    dragStartY = lastY;
    startScroll = window.scrollY;
    currentTarget = fromIndex;
    item.classList.add('is-dragging');
    list.classList.add('is-reordering');
    document.body.classList.add('is-dragging-timeline');
    if (navigator.vibrate) navigator.vibrate(15);
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function stopPress() {
    clearTimeout(timer);
    timer = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onCancel);
  }

  function finish(commit) {
    const wasDragging = dragging;
    stopPress();
    if (!wasDragging) return;

    dragging = false;
    reordering = false;
    cancelAnimationFrame(scrollFrame);
    suppressClickUntil = Date.now() + 400;

    nodes.forEach((node) => {
      node.style.transition = 'none';
      node.style.transform = '';
    });
    item.classList.remove('is-dragging');
    list.classList.remove('is-reordering');
    document.body.classList.remove('is-dragging-timeline');

    if (commit && currentTarget !== fromIndex) {
      const others = nodes.filter((node) => node !== item);
      const prev = currentTarget > 0 ? eventByNode.get(others[currentTarget - 1]) : null;
      const next = others[currentTarget] ? eventByNode.get(others[currentTarget]) : null;
      list.insertBefore(item, others[currentTarget] ?? null);

      let order;
      if (prev && next) order = (prev.order + next.order) / 2;
      else if (next) order = next.order - 1;
      else order = prev.order + 1;

      onReorder(eventByNode.get(item), order);
    }

    requestAnimationFrame(() => {
      nodes.forEach((node) => {
        node.style.transition = '';
      });
    });
  }

  function onMove(event) {
    lastY = event.clientY;
    if (!dragging) {
      if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > MOVE_CANCEL) stopPress();
      return;
    }
    follow();
  }

  function onEnd() {
    finish(true);
  }

  function onCancel() {
    finish(false);
  }

  item.addEventListener('pointerdown', (event) => {
    if (document.body.dataset.auth !== 'in') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pressX = event.clientX;
    pressY = event.clientY;
    lastY = event.clientY;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onCancel);
    timer = setTimeout(() => {
      timer = null;
      startDrag();
    }, LONG_PRESS_MS);
  });

  item.addEventListener('contextmenu', (event) => {
    if (timer || dragging) event.preventDefault();
  });
}

export function renderTimeline(events, emptyText, onSelect, onReorder) {
  if (!events.length) return renderEmpty(emptyText);

  const eventByNode = new Map();
  const list = h('ol', { class: 'timeline' });

  events.forEach((event) => {
    const item = h(
      'li',
      {
        class: 'timeline-item' + (onSelect ? ' is-clickable' : ''),
        dataset: event.id ? { entry: `${event.table}:${event.id}` } : {},
        tabindex: onSelect ? '0' : null,
        role: onSelect ? 'button' : null,
      },
      event.date ? h('span', { class: 'timeline-date' }, event.date) : null,
      h('h3', {}, event.title),
      h('p', {}, event.description)
    );

    eventByNode.set(item, event);

    if (onSelect) {
      item.addEventListener('click', () => {
        if (Date.now() < suppressClickUntil) return;
        onSelect(event, item);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(event, item);
        }
      });
    }

    if (onReorder) enableReorder(list, item, eventByNode, onReorder);

    list.append(item);
  });

  return list;
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
          dataset: item.id ? { entry: `${item.table}:${item.id}` } : {},
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
        h('p', { class: 'entry-desc' }, item.description),
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

function icon(name) {
  return h('span', { class: `icon icon-${name}`, 'aria-hidden': 'true' });
}

function iconButton(name, label, onClick, extraClass = '') {
  return h(
    'button',
    {
      type: 'button',
      class: `icon-btn ${extraClass}`.trim(),
      'aria-label': label,
      title: label,
      onClick,
    },
    icon(name)
  );
}

/* ---------- Лайтбокс со свайпом ---------- */

function openLightbox(urls, startIndex = 0) {
  let index = startIndex;
  const img = h('img', { class: 'lightbox-image', alt: '' });
  const counter = h('span', { class: 'lightbox-counter' });
  const prev = h('button', { type: 'button', class: 'lightbox-nav lightbox-prev', 'aria-label': 'Предыдущее', onClick: () => show(index - 1) }, '‹');
  const next = h('button', { type: 'button', class: 'lightbox-nav lightbox-next', 'aria-label': 'Следующее', onClick: () => show(index + 1) }, '›');
  const closeBtn = h('button', { type: 'button', class: 'lightbox-close', 'aria-label': 'Закрыть', title: 'Закрыть', onClick: close }, icon('close'));
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

  /* ---------- Свайп на тач-устройствах ---------- */

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let tracking = false;

  const SWIPE_MIN = 50;      // минимум по горизонтали для переключения
  const CLOSE_MIN = 80;      // минимум по вертикали для закрытия
  const MAX_OFFSET = 120;    // максимум сдвига картинки при перетаскивании

  overlay.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) return;
      const t = event.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
      tracking = true;
      img.style.transition = 'none';
    },
    { passive: true }
  );

  overlay.addEventListener(
    'touchmove',
    (event) => {
      if (!tracking) return;
      if (event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = event.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      // Если жест больше по вертикали — ведём вниз (к закрытию)
      if (Math.abs(dy) > Math.abs(dx)) {
        const offset = Math.max(0, Math.min(dy, MAX_OFFSET));
        img.style.transform = `translateY(${offset}px)`;
        overlay.style.opacity = String(1 - offset / (MAX_OFFSET * 2));
      } else {
        // Горизонтальный жест — сдвигаем картинку вбок
        const offset = Math.max(-MAX_OFFSET, Math.min(dx, MAX_OFFSET));
        img.style.transform = `translateX(${offset}px)`;
      }
    },
    { passive: true }
  );

  overlay.addEventListener(
    'touchend',
    (event) => {
      if (!tracking) return;
      tracking = false;

      const t = event.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const dt = Date.now() - touchStartTime;
      const velocity = Math.abs(dx) / Math.max(dt, 1); // px/ms

      img.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      img.style.transform = '';
      overlay.style.opacity = '';

      // Свайп вниз → закрыть
      if (dy > CLOSE_MIN && Math.abs(dy) > Math.abs(dx)) {
        close();
        return;
      }

      // Горизонтальный свайп → переключить
      if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) show(index + 1);
        else show(index - 1);
        return;
      }

      // Быстрый флик (короткий, но резкий свайп)
      if (velocity > 0.5 && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) show(index + 1);
        else show(index - 1);
      }
    },
    { passive: true }
  );

  /* ---------- Клик по фону и клавиатура ---------- */

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  show(index);
  closeBtn.focus();
}

/* ---------- Related images ---------- */

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

/* ---------- Связанные записи ---------- */

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

/* ---------- Универсальный бланк записи ---------- */

export function renderEntryDetails(entry, { canEdit = false, onOpen, onBack, onEdit, onDelete } = {}) {
  const related = entry.images ?? [];
  const gallery = [entry.imageUrl, ...related].filter(Boolean);
  const offset = entry.imageUrl ? 1 : 0;

  return h(
    'div',
    { class: 'entry-details' },
    onBack ? h('button', { type: 'button', class: 'details-back', onClick: onBack }, icon('back'), 'Назад') : null,
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
        iconButton('edit', 'Редактировать', onEdit),
        iconButton('trash', 'Удалить', onDelete, 'danger')
      )
      : null
  );
}

/* ---------- Галерея ---------- */

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
          dataset: item.id ? { entry: `${item.table}:${item.id}` } : {},
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