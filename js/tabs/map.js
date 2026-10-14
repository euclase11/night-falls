// js/tabs/map.js
import { config } from '../config.js';
import { store } from '../store.js';
import { createMapView } from '../map.js';

export const mapTab = {
  id: 'map',
  useWorld: false,
  useSearch: false,
  placeholder: '',

  async load() {
    return store.settlements();
  },

  render(items, _emptyText, ctx) {
    return createMapView(items, config, {
      onSelect: ctx.onSelectEntry,
    });
  },
};