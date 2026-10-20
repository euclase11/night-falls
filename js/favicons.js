const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function realIcon() {
  return [
    svgEl('path', {
      d: 'M12 2 L20 6.5 L20 15.5 L12 20 L4 15.5 L4 6.5 Z',
      fill: 'none',
    }),
    svgEl('circle', { cx: 12, cy: 11, r: 3, fill: 'none' }),
  ];
}

function afterlifeIcon() {
  return [
    svgEl('path', {
      d:
        'M 12 12 ' +
        'C 9.5 9,   5 7,    3 8 ' +
        'C 1.5 8.5, 1.5 15.5, 3 16 ' +
        'C 5 17,    9.5 15, 12 12 ' +
        'C 14.5 9,  19 7,   21 8 ' +
        'C 22.5 8.5, 22.5 15.5, 21 16 ' +
        'C 19 17,   14.5 15, 12 12 Z',
      fill: 'none',
      class: 'fav-ring',
    }),
    svgEl('circle', { cx: 6.5,  cy: 12, r: 1.7, stroke: 'none', class: 'fav-dot' }),
    svgEl('circle', { cx: 17.5, cy: 12, r: 1.7, stroke: 'none', class: 'fav-dot' }),
  ];
}

export function worldFavIcon(world = 'real') {
  const svg = svgEl('svg', {
    viewBox: '0 0 24 24',
    class: 'fav-icon',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.append(...(world === 'afterlife' ? afterlifeIcon() : realIcon()));
  return svg;
}