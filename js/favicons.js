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
    svgEl('path', { d: 'M6 21 L6 11 Q12 4 18 11 L18 21', fill: 'none' }),
    svgEl('path', { d: 'M6 21 L18 21', fill: 'none' }),
    svgEl('circle', { cx: 12, cy: 15, r: 0.9, fill: 'currentColor', stroke: 'none' }),
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