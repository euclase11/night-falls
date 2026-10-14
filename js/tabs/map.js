// js/tabs/map.js
import { config } from '../config.js';
import { store } from '../store.js';
import { renderMap } from '../render.js';

export const mapTab = {
  id: 'map',
  useWorld: false,
  useSearch: false,
  placeholder: '',

  async load() {
    return store.settlements();
  },

  render(items, _emptyText, ctx) {
    return renderMap(items, config, ctx.onSelectEntry);
  },
};