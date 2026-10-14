export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.assign(element.dataset, value);
    } else if (key.startsWith('on')) {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

export function normalize(value) {
  return String(value ?? '').toLowerCase().replaceAll('ё', 'е');
}

export function matchesQuery(item, query, fields) {
  const needle = normalize(query).trim();
  if (!needle) return true;
  return fields.some((field) => {
    const value = item[field];
    const text = Array.isArray(value) ? value.join(' ') : value;
    return normalize(text).includes(needle);
  });
}

export function readableText(hex) {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw;
  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.6 ? '#14121c' : '#ffffff';
}

export function applyColor(node, color) {
  if (!color) return;
  node.style.setProperty('--marker-color', color);
  node.style.setProperty('--marker-ink', readableText(color));
}