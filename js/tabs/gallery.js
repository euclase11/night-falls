import { store } from '../store.js';
import { renderGallery } from '../render.js';
import { matchesQuery } from '../util.js';

export const galleryTab = {
  id: 'gallery',
  useWorld: true,
  useSearch: true,
  placeholder: 'Поиск по галерее',

  async load(state) {
    const items = await store.gallery();
    return items
      .filter((i) => i.world === state.world)
      .filter((i) => matchesQuery(i, state.query, ['name', 'description']))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },

  render(items, emptyText, ctx) {
    return renderGallery(items, emptyText, ctx.onSelectEntry);
  },
};