import { store } from '../store.js';
import { supabase } from '../supabase.js';
import { createBoardView } from '../board.js';

export const boardTab = {
  id: 'board',
  useWorld: true,
  useSearch: false,
  placeholder: '',

  async load(state) {
    const [all, { data: { session } }] = await Promise.all([store.all(), supabase.auth.getSession()]);
    return { all, world: state.world, userId: session?.user?.id ?? null };
  },

  render(data, _emptyText, ctx) {
    return createBoardView(data, { onSelect: ctx.onSelectEntry });
  },
};