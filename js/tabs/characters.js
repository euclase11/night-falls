// js/tabs/characters.js
import { store } from '../store.js';
import { renderEntries } from '../render.js';
import { matchesQuery } from '../util.js';

export const charactersTab = {
  id: 'characters',
  useWorld: true,
  useSearch: true,
  placeholder: 'Поиск по персонажам',

  async load(state) {
    const items = await store.characters();
    return items
      .filter((i) => i.world === state.world)
      .filter((i) => matchesQuery(i, state.query, ['name', 'kind', 'meta', 'description', 'tags']))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  },

  render(items, emptyText) {
    return renderEntries(items, emptyText);
  },
};