import { store } from '../store.js';
import { renderGallery } from '../render.js';
import { matchesQuery, favoritesFirst } from '../util.js';

export const galleryTab = {
  id: 'gallery',
  useWorld: true,
  useSearch: true,
  placeholder: 'Поиск по галерее',
  useFavorites: true,

  async load(state) {
    const [items, favorites] = await Promise.all([store.galleryFeed(), store.favorites()]);
    const sorted = items
      .filter((i) => i.world === state.world)
      .filter((i) => matchesQuery(i, state.query, ['name', 'description']))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return favoritesFirst(sorted, favorites);
  },

  render(items, emptyText, ctx) {
    return renderGallery(items, emptyText, ctx.onSelectEntry);
  },
};