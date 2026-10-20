// js/tabs/characters.js
import { store } from '../store.js';
import { renderEntries } from '../render.js';
import { matchesQuery, favoritesFirst } from '../util.js';

export const charactersTab = {
  id: 'characters',
  useWorld: true,
  useSearch: true,
  placeholder: 'Поиск по персонажам',
  useFavorites: true,

  async load(state) {
    const [items, favorites] = await Promise.all([store.characters(), store.favorites()]);
    const sorted = items
      .filter((i) => i.world === state.world)
      .filter((i) => matchesQuery(i, state.query, ['name', 'kind', 'meta', 'description', 'tags']))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return favoritesFirst(sorted, favorites);
  },

  render(items, emptyText, ctx) {
    return renderEntries(items, emptyText, ctx.onSelectEntry);
  },
};