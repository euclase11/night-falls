// js/store.js
import { Character, Settlement, Event, MiscEntry } from './models.js';

/**
 * Кэш загруженных данных. Пока ничего не менялось —
 * повторные обращения к Supabase не идут.
 */
const cache = {
  characters: null,
  settlements: null,
  events: null,
  other: null,
};

/** Сбросить кэш (после добавления/редактирования/удаления). */
export function invalidateCache(table) {
  if (table) {
    if (table in cache) cache[table] = null;
  } else {
    for (const key of Object.keys(cache)) cache[key] = null;
  }
}

export const store = {
  async characters() {
    if (cache.characters) return cache.characters;
    const list = await Character.list();
    cache.characters = list.map((c) => ({ ...c.toCard(), table: 'characters' }));
    return cache.characters;
  },

  async settlements() {
    if (cache.settlements) return cache.settlements;
    const list = await Settlement.list();
    cache.settlements = list.map((s) => {
      const coords = s.coordinates || {};
      return {
        id: s.id,
        table: 'settlements',
        world: s.world,
        name: s.name,
        description: s.description,
        x: coords.x ?? null,
        y: coords.y ?? null,
        coordinates: coords,
        color: s.color,
        number: s.number,
        kind: 'Поселение',
        meta: null,
        tags: [],
        imageUrl: null,
      };
    });
    return cache.settlements;
  },

  async events() {
    if (cache.events) return cache.events;
    const list = await Event.list();
    cache.events = list.map((e) => ({
      id: e.id,
      table: 'events',
      world: e.world,
      title: e.title,
      description: e.description,
      scope: e.scope,
      date: e.date,
      order: e.order,
      name: e.title,
      kind: 'Событие',
      meta: e.date,
      tags: [],
      imageUrl: null,
    }));
    return cache.events;
  },

  async other() {
    if (cache.other) return cache.other;
    const list = await MiscEntry.list();
    cache.other = list.map((m) => ({ ...m.toCard(), table: 'misc' }));
    return cache.other;
  },
};