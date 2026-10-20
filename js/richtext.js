import { h } from './util.js';

const INLINE = /\[\[([^\]|]+)\|([^\]]+)\]\]|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;

function linkNode(label, key, onLink) {
  const children = inline(label, null);
  if (!/^[a-z_]+:.+$/.test(key)) return children;
  if (!onLink) return h('span', { class: 'text-link' }, children);
  return h(
    'button',
    {
      type: 'button',
      class: 'text-link',
      dataset: { key },
      onClick: (event) => {
        event.stopPropagation();
        onLink(key);
      },
    },
    children
  );
}

function inline(text, onLink) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) nodes.push(linkNode(match[1], match[2], onLink));
    else if (match[3] !== undefined) nodes.push(h('strong', {}, inline(match[3], onLink)));
    else if (match[4] !== undefined) nodes.push(h('em', {}, inline(match[4], onLink)));
    else nodes.push(h('code', {}, match[5]));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const isQuote = (line) => /^>\s?/.test(line);
const isBullet = (line) => /^-\s+/.test(line);
const isNumber = (line) => /^\d+\.\s+/.test(line);
const isHeading = (line) => /^#{1,3}\s+/.test(line);
const isSpecial = (line) => isQuote(line) || isBullet(line) || isNumber(line) || isHeading(line);

export function renderRich(text, { onLink } = {}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const root = h('div', { class: 'rich' });
  let index = 0;

  function joinLines(list) {
    return list.flatMap((line, i) => (i ? [h('br'), ...inline(line, onLink)] : inline(line, onLink)));
  }

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isHeading(line)) {
      const match = line.match(/^(#{1,3})\s+(.*)$/);
      root.append(h(`h${match[1].length + 2}`, {}, inline(match[2], onLink)));
      index += 1;
      continue;
    }

    if (isQuote(line)) {
      const block = [];
      while (index < lines.length && isQuote(lines[index])) {
        block.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      root.append(h('blockquote', {}, h('p', {}, joinLines(block))));
      continue;
    }

    if (isBullet(line) || isNumber(line)) {
      const ordered = isNumber(line);
      const test = ordered ? isNumber : isBullet;
      const strip = ordered ? /^\d+\.\s+/ : /^-\s+/;
      const items = [];
      while (index < lines.length && test(lines[index])) {
        items.push(lines[index].replace(strip, ''));
        index += 1;
      }
      root.append(h(ordered ? 'ol' : 'ul', {}, items.map((item) => h('li', {}, inline(item, onLink)))));
      continue;
    }

    const block = [];
    while (index < lines.length && lines[index].trim() && !isSpecial(lines[index])) {
      block.push(lines[index]);
      index += 1;
    }
    root.append(h('p', {}, joinLines(block)));
  }

  return root;
}

export function plainText(text) {
  return String(text ?? '')
    .replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, '$1')
    .replace(/^(#{1,3}\s+|>\s?|-\s+|\d+\.\s+)/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}

export function hasLinkKey(text, key) {
  return String(text ?? '').includes(`|${key}]]`);
}

export function unlinkKey(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text ?? '').replace(new RegExp(`\\[\\[([^\\]|]+)\\|${escaped}\\]\\]`, 'g'), '$1');
}