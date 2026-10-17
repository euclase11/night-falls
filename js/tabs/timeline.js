// js/tabs/timeline.js
import { store } from '../store.js';
import { renderTimeline, renderSegmented } from '../render.js';
import { matchesQuery } from '../util.js';

export const timelineTab = {
  id: 'timeline',
  useWorld: true,
  useSearch: true,
  placeholder: 'Поиск по событиям',

  async load(state) {
    const events = await store.events();
    return events
      .filter((e) => e.world === state.world && e.scope === state.scope)
      .filter((e) => matchesQuery(e, state.query, ['title', 'description', 'date']))
      .sort((a, b) => a.order - b.order);
  },

  async renderControls(state, ctx) {
    return renderSegmented({
      options: [
        ['global', 'Глобальный сюжет'],
        ['local', 'Локальный сюжет'],
      ],
      current: state.scope,
      label: 'Масштаб сюжета',
      className: 'segmented',
      onPick: (value) => ctx.onScopeChange(value),
    });
  },

  render(items, emptyText, ctx) {
    return renderTimeline(items, emptyText, ctx.onSelectEntry, ctx.onReorder);
  },
};