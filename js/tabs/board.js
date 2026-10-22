import { store } from '../store.js';
import { supabase } from '../supabase.js';
import { createBoardView } from '../board.js';
import { fetchAllRelations } from '../relations.js';

export const boardTab = {
  id: 'board',
  useWorld: true,
  useSearch: false,
  placeholder: '',

  async load(state) {
    const [all, { data: { session } }, relations] = await Promise.all([
      store.all(),
      supabase.auth.getSession(),
      fetchAllRelations().catch((error) => {
        console.error('Failed to load character relations:', error);
        return [];
      }),
    ]);
    return { all, world: state.world, userId: session?.user?.id ?? null, relations };
  },

  render(data, _emptyText, ctx) {
    return createBoardView(data, { onSelect: ctx.onSelectEntry });
  },
};