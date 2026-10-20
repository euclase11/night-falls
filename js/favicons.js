const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Реальный мир: шестигранная гайка — чистый industrial/mechancore
function realIcon() {
  return [
    svgEl('path', {
      d: 'M12 2 L20 6.5 L20 15.5 L12 20 L4 15.5 L4 6.5 Z',
      fill: 'none',
    }),
    svgEl('circle', { cx: 12, cy: 11, r: 3, fill: 'none' }),
  ];
}

// Посмертие: невысокий дом с двускатной крышей и трубой — ренессанс
function afterlifeIcon() {
  return [
    svgEl('path', { d: 'M3 11 L12 4 L21 11', fill: 'none' }),
    svgEl('path', { d: 'M5 10 L5 20 L19 20 L19 10', fill: 'none' }),
    svgEl('rect', { x: 10, y: 14, width: 4, height: 6, fill: 'none' }),
    svgEl('path', { d: 'M16 9 L16 5 L18 5 L18 9', fill: 'none' }),
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