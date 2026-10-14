// js/tabs/other.js
import { store } from '../store.js';
import { renderEntries, renderSegmented } from '../render.js';
import { matchesQuery } from '../util.js';

export const otherTab = {
  id: 'other',
  useWorld: true,
  useSearch: true,
  placeholder: 'Поиск по записям',

  async loadAll() {
    const [settlements, events, other] = await Promise.all([
      store.settlements(),
      store.events(),
      store.other(),
    ]);
    return [...settlements, ...events, ...other];
  },

  async load(state) {
    const items = await this.loadAll();
    return items
      .filter((i) => i.world === state.world)
      .filter((i) => state.kind === 'all' || i.kind === state.kind)
      .filter((i) => matchesQuery(i, state.query, ['name', 'kind', 'meta', 'description', 'tags']))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  },

  async renderControls(state, ctx) {
    const items = await this.loadAll();
    const kinds = [...new Set(items.filter((i) => i.world === state.world).map((i) => i.kind))];
    if (kinds.length === 0) return null;
    return renderSegmented({
      options: [['all', 'Все'], ...kinds.map((k) => [k, k])],
      current: state.kind,
      label: 'Тип записи',
      className: 'chips',
      onPick: (value) => ctx.onKindChange(value),
    });
  },

  render(items, emptyText, ctx) {
    return renderEntries(items, emptyText, ctx.onSelectEntry);
  },
};