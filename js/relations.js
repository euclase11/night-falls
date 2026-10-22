import { h } from './util.js';
import { supabase } from './supabase.js';
import { store } from './store.js';

const DEFAULT_COLOR = '#f2c94c';
const SVG_NS = 'http://www.w3.org/2000/svg';
const WORLD_LABELS = { real: 'реальный мир', afterlife: 'посмертие' };
let uid = 0;

export async function fetchTypes() {
  const { data, error } = await supabase.from('relation_types').select('id, name, color').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function loadRelationsFor(characterId) {
  const { data, error } = await supabase
    .from('character_relations')
    .select('id, from_id, to_id, type_id')
    .or(`from_id.eq.${characterId},to_id.eq.${characterId}`);
  if (error) throw error;
  return data ?? [];
}

export async function saveRelations(characterId, rows) {
  if (!rows) return;
  const types = await fetchTypes();
  const byName = new Map(types.map((type) => [type.name.toLowerCase(), type]));
  const wanted = new Map();

  for (const row of rows) {
    const name = row.type.trim();
    if (!name || row.other === null || row.other === undefined) continue;
    const key = name.toLowerCase();
    let type = byName.get(key);
    if (!type) {
      const { data, error } = await supabase
        .from('relation_types')
        .insert({ name, color: row.color })
        .select()
        .single();
      if (error) throw error;
      type = data;
      byName.set(key, type);
    } else if (type.color !== row.color) {
      const { error } = await supabase.from('relation_types').update({ color: row.color }).eq('id', type.id);
      if (error) throw error;
      type.color = row.color;
    }
    const from = row.direction === 'in' ? row.other : characterId;
    const to = row.direction === 'in' ? characterId : row.other;
    wanted.set(`${from}|${to}|${type.id}`, { from_id: from, to_id: to, type_id: type.id });
  }

  const existing = await loadRelationsFor(characterId);
  const existingKeys = new Set(existing.map((item) => `${item.from_id}|${item.to_id}|${item.type_id}`));
  const toDelete = existing
    .filter((item) => !wanted.has(`${item.from_id}|${item.to_id}|${item.type_id}`))
    .map((item) => item.id);
  const toInsert = [...wanted.entries()].filter(([key]) => !existingKeys.has(key)).map(([, value]) => value);

  if (toDelete.length) {
    const { error } = await supabase.from('character_relations').delete().in('id', toDelete);
    if (error) throw error;
  }
  if (toInsert.length) {
    const { error } = await supabase.from('character_relations').insert(toInsert);
    if (error) throw error;
  }
}

export async function fetchAllRelations() {
  const { data, error } = await supabase
    .from('character_relations')
    .select('from_id, to_id');
  if (error) throw error;
  return data ?? [];
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function unit(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function buildGraph(entry, relations, types, characters, onOpen) {
  const typeById = new Map(types.map((type) => [type.id, type]));
  const people = new Map(characters.map((item) => [String(item.id), item]));
  const centerKey = String(entry.id);
  const keys = [];

  for (const relation of relations) {
    for (const id of [relation.from_id, relation.to_id]) {
      const key = String(id);
      if (key !== centerKey && people.has(key) && !keys.includes(key)) keys.push(key);
    }
  }

  const width = 360;
  const height = 340;
  const cx = width / 2;
  const cy = height / 2;
  const radius = keys.length <= 2 ? 120 : 130;
  const positions = new Map([[centerKey, { x: cx, y: cy, r: 30 }]]);
  keys.forEach((key, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / keys.length;
    positions.set(key, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), r: 22 });
  });
  const centerPos = positions.get(centerKey);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'rel-graph',
    role: 'img',
    'aria-label': `Отношения: ${entry.name}`,
  });
  const defs = svgEl('defs');
  const edgesLayer = svgEl('g');
  const nodesLayer = svgEl('g');
  svg.append(defs, edgesLayer, nodesLayer);

  const markers = new Map();
  function markerFor(color) {
    if (markers.has(color)) return markers.get(color);
    uid += 1;
    const id = `rel-arrow-${uid}`;
    const marker = svgEl('marker', {
      id,
      markerWidth: 9,
      markerHeight: 9,
      refX: 8,
      refY: 4.5,
      orient: 'auto',
      markerUnits: 'userSpaceOnUse',
    });
    marker.append(svgEl('path', { d: 'M0 0 L9 4.5 L0 9 z', fill: color }));
    defs.append(marker);
    markers.set(color, id);
    return id;
  }

  const tip = h('div', { class: 'rel-tip', hidden: true });
  const wrap = h('div', { class: 'rel-wrap' }, svg, tip);
  let tipOwner = null;

  function showTip(owner, text, event) {
    const rect = wrap.getBoundingClientRect();
    tip.textContent = text;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(event.clientX - rect.left, 8), rect.width - 8)}px`;
    tip.style.top = `${event.clientY - rect.top - 12}px`;
    tipOwner = owner;
  }

  function hideTip() {
    tip.hidden = true;
    tipOwner = null;
  }

  wrap.addEventListener('click', hideTip);

  const groups = new Map();
  for (const relation of relations) {
    const key = [String(relation.from_id), String(relation.to_id)].sort().join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(relation);
  }

  const usedTypes = new Map();

  for (const list of groups.values()) {
    list.forEach((relation, index) => {
      const from = positions.get(String(relation.from_id));
      const to = positions.get(String(relation.to_id));
      const type = typeById.get(relation.type_id);
      if (!from || !to || !type) return;
      usedTypes.set(type.id, type);

      const other = from === centerPos ? to : from;
      const axis = unit(other.x - centerPos.x, other.y - centerPos.y);
      const offset = (index - (list.length - 1) / 2) * 36;
      const mx = (from.x + to.x) / 2 - axis.y * offset * 2;
      const my = (from.y + to.y) / 2 + axis.x * offset * 2;
      const startDir = unit(mx - from.x, my - from.y);
      const endDir = unit(mx - to.x, my - to.y);
      const sx = from.x + startDir.x * from.r;
      const sy = from.y + startDir.y * from.r;
      const ex = to.x + endDir.x * (to.r + 3);
      const ey = to.y + endDir.y * (to.r + 3);
      const d = `M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`;
      const text = `${type.name}: ${people.get(String(relation.from_id))?.name ?? '?'} → ${people.get(String(relation.to_id))?.name ?? '?'}`;

      edgesLayer.append(
        svgEl('path', { d, class: 'rel-edge', stroke: type.color, 'marker-end': `url(#${markerFor(type.color)})` })
      );

      const hit = svgEl('path', { d, class: 'rel-hit' });
      hit.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') showTip(hit, text, event);
      });
      hit.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'mouse' && tipOwner === hit) showTip(hit, text, event);
      });
      hit.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse') hideTip();
      });
      hit.addEventListener('click', (event) => {
        event.stopPropagation();
        if (tipOwner === hit && event.pointerType !== 'mouse') hideTip();
        else showTip(hit, text, event);
      });
      edgesLayer.append(hit);
    });
  }

  for (const [key, position] of positions) {
    const person = people.get(key);
    if (!person) continue;
    const isCenter = key === centerKey;
    const node = svgEl('g', {
      class: `rel-node${isCenter ? ' is-center' : ''}`,
      transform: `translate(${position.x} ${position.y})`,
    });

    node.append(svgEl('circle', { r: position.r }));

    if (person.imageUrl) {
      uid += 1;
      const clipId = `rel-clip-${uid}`;
      const clip = svgEl('clipPath', { id: clipId });
      clip.append(svgEl('circle', { r: position.r - 2 }));
      defs.append(clip);
      node.append(
        svgEl('image', {
          href: person.imageUrl,
          x: -position.r,
          y: -position.r,
          width: position.r * 2,
          height: position.r * 2,
          preserveAspectRatio: 'xMidYMid slice',
          'clip-path': `url(#${clipId})`,
        })
      );
    } else {
      const letter = svgEl('text', { class: 'rel-letter', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      letter.textContent = person.name.charAt(0).toUpperCase();
      node.append(letter);
    }

    const title = svgEl('title');
    title.textContent = person.name;
    node.append(title);


    node.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') showTip(node, person.name, event);
    });
    node.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse' && tipOwner === node) {
        showTip(node, person.name, event);
      }
    });
    node.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') hideTip();
    });

    if (!isCenter) {
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', person.name);
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        hideTip();
        onOpen?.(person);
      });
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(person);
        }
      });
    }

    nodesLayer.append(node);
  }

  const legend = h(
    'ul',
    { class: 'rel-legend' },
    [...usedTypes.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((type) =>
        h('li', {}, h('span', { class: 'rel-swatch', style: `background:${type.color}` }), type.name)
      )
  );

  const hint = h('p', { class: 'rel-hint' }, 'Стрелка идёт от того, кто в этой роли, к тому, для кого.');
  return [wrap, legend, hint];
}

export function renderRelationsPanel(entry, onOpen) {
  const box = h('div', { class: 'relations' }, h('p', { class: 'empty' }, 'Загрузка...'));

  Promise.all([loadRelationsFor(entry.id), fetchTypes(), store.characters()])
    .then(([relations, types, characters]) => {
      if (!relations.length) {
        box.replaceChildren(h('p', { class: 'empty' }, 'Отношений пока нет.'));
        return;
      }
      box.replaceChildren(...buildGraph(entry, relations, types, characters, onOpen));
    })
    .catch((error) => {
      console.error(error);
      box.replaceChildren(h('p', { class: 'empty' }, 'Не удалось загрузить отношения.'));
    });

  return box;
}

export function renderRelationsField(field, { selfId, world }) {
  const rows = h('div', { class: 'rel-rows' });
  const otherWorld = h('input', { type: 'checkbox' });
  const toggle = h('label', { class: 'links-toggle rel-toggle' }, otherWorld, 'Показывать персонажей из другого мира');
  const datalist = h('datalist', { id: 'relation-type-list' });
  const addButton = h('button', { type: 'button', class: 'rel-add', disabled: true }, '+ Добавить отношение');
  const hint = h(
    'p',
    { class: 'rel-hint' },
    '«Этот → выбранный» значит, что этот персонаж в указанной роли для выбранного. Тип можно ввести свой, подсказки берутся из уже существующих.'
  );
  const group = h(
    'div',
    { class: 'field-group', id: `field-${field.name}` },
    h('span', {}, field.label),
    toggle,
    rows,
    addButton,
    hint,
    datalist
  );

  let characters = [];
  let types = [];
  let ready = false;
  const lines = [];
  const ids = new Map();

  function fillPeople(line, selected) {
    const current = selected !== undefined && selected !== null ? String(selected) : line.person.value;
    const showAll = otherWorld.checked;
    const options = characters
      .filter((item) => showAll || item.world === world || String(item.id) === current)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    line.person.replaceChildren(
      h('option', { value: '' }, 'Выберите персонажа'),
      ...options.map((item) =>
        h(
          'option',
          { value: String(item.id) },
          item.world !== world ? `${item.name} (${WORLD_LABELS[item.world] ?? item.world})` : item.name
        )
      )
    );
    line.person.value = current;
  }

  function addRow(initial) {
    const direction = h(
      'select',
      { class: 'rel-direction' },
      h('option', { value: 'out' }, 'Этот → выбранный'),
      h('option', { value: 'in' }, 'Выбранный → этот')
    );
    direction.value = initial.direction;
    const person = h('select', { class: 'rel-person' });
    const type = h('input', {
      type: 'text',
      class: 'rel-type',
      list: 'relation-type-list',
      placeholder: 'Тип: наставник, друг...',
      maxlength: 40,
    });
    type.value = initial.type;
    const color = h('input', { type: 'color', class: 'rel-color', value: initial.color });
    let touched = false;
    color.addEventListener('input', () => {
      touched = true;
    });
    type.addEventListener('input', () => {
      if (touched) return;
      const found = types.find((item) => item.name.toLowerCase() === type.value.trim().toLowerCase());
      color.value = found ? found.color : DEFAULT_COLOR;
    });

    const line = { direction, person, type, color };
    const node = h(
      'div',
      { class: 'rel-row' },
      direction,
      person,
      type,
      color,
      h(
        'button',
        {
          type: 'button',
          class: 'rel-remove',
          'aria-label': 'Убрать отношение',
          onClick: () => {
            node.remove();
            lines.splice(lines.indexOf(line), 1);
            group.dispatchEvent(new Event('change', { bubbles: true }));
          },
        },
        '×'
      )
    );
    lines.push(line);
    fillPeople(line, initial.other);
    rows.append(node);
  }

  otherWorld.addEventListener('change', () => lines.forEach((line) => fillPeople(line)));
  addButton.addEventListener('click', () => {
    addRow({ direction: 'out', other: null, type: '', color: DEFAULT_COLOR });
    group.dispatchEvent(new Event('change', { bubbles: true }));
  });

  Promise.all([store.characters(), fetchTypes(), selfId ? loadRelationsFor(selfId) : Promise.resolve([])])
    .then(([allCharacters, allTypes, relations]) => {
      characters = allCharacters.filter((item) => String(item.id) !== String(selfId));
      ids.clear();
      characters.forEach((item) => ids.set(String(item.id), item.id));
      types = allTypes;
      datalist.replaceChildren(...types.map((item) => h('option', { value: item.name })));
      const typeById = new Map(types.map((item) => [item.id, item]));
      for (const relation of relations) {
        const type = typeById.get(relation.type_id);
        if (!type) continue;
        const outgoing = String(relation.from_id) === String(selfId);
        addRow({
          direction: outgoing ? 'out' : 'in',
          other: outgoing ? relation.to_id : relation.from_id,
          type: type.name,
          color: type.color,
        });
      }
      ready = true;
      addButton.disabled = false;
    })
    .catch((error) => {
      console.error(error);
      group.append(h('p', { class: 'links-hint' }, 'Не удалось загрузить отношения. Проверь таблицы в Supabase.'));
    });

  group.getValue = () => {
    if (!ready) return null;
    return lines.map((line) => ({
      direction: line.direction.value,
      other: ids.get(line.person.value) ?? null,
      type: line.type.value,
      color: line.color.value,
    }));
  };

  return group;
}