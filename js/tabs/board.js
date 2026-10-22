import { createBoardView } from '../board.js';
import { store } from '../store.js';
import { fetchAllRelations } from '../relations.js';
import { supabase } from '../supabase.js';

async function loadBoardData(state) {
  const [all, relationsResult] = await Promise.all([
    store.all(),
    fetchAllRelations().catch((error) => {
      console.error('Failed to load character relations:', error);
      return [];
    }),
  ]);

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  return { all, relations: relationsResult, userId, world: state.world };
}

export const boardTab = {
  useWorld: true,
  useSearch: false,
  useFavorites: false,
  placeholder: '',

  async load(state) {
    return loadBoardData(state);
  },

  render(data, emptyText, ctx) {
    return createBoardView(
      {
        all: data.all,
        world: data.world,
        userId: data.userId,
        relations: data.relations,
      },
      {
        onSelect: (entry, trigger) => ctx.onSelectEntry(entry, trigger),
      }
    );
  },
};

export default boardTab;