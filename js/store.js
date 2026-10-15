import { Character, Settlement, Event, MiscEntry, GalleryItem } from './models.js';

export const REF_LABELS = {
  characters: 'Персонаж',
  settlements: 'Поселение',
  events: 'Событие',
  misc: 'Запись',
  gallery: 'Галерея',
};

const cache = {
  characters: null,
  settlements: null,
  events: null,
  other: null,
  gallery: null,
};

const TABLE_TO_CACHE = {
  characters: 'characters',
  settlements: 'settlements',
  events: 'events',
  misc: 'other',
  gallery: 'gallery',
};

export function invalidateCache(table) {
  if (table) {
    const key = TABLE_TO_CACHE[table];
    if (key) cache[key] = null;
  } else {
    for (const key of Object.keys(cache)) cache[key] = null;
  }
}

function extras(row) {
  return {
    raw: { ...row },
    links: Array.isArray(row.links) ? row.links : [],
    images: Array.isArray(row.images) ? row.images : [],
  };
}

export const store = {
  async characters() {
    if (cache.characters) return cache.characters;
    const list = await Character.list();
    cache.characters = list.map((c) => ({ ...c.toCard(), table: 'characters', ...extras(c) }));
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
        ...extras(s),
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
      ...extras(e),
    }));
    return cache.events;
  },

  async other() {
    if (cache.other) return cache.other;
    const list = await MiscEntry.list();
    cache.other = list.map((m) => ({ ...m.toCard(), table: 'misc', ...extras(m) }));
    return cache.other;
  },

  async gallery() {
    if (cache.gallery) return cache.gallery;
    const list = await GalleryItem.list();
    cache.gallery = list.map((g) => ({
      id: g.id,
      table: 'gallery',
      world: g.world,
      name: g.title,
      description: g.description ?? '',
      kind: 'Галерея',
      meta: null,
      tags: [],
      imageUrl: g.image_url,
      createdAt: g.created_at ?? '',
      ...extras(g),
    }));
    return cache.gallery;
  },

  async all() {
    const lists = await Promise.all([
      this.characters(),
      this.settlements(),
      this.events(),
      this.other(),
      this.gallery(),
    ]);
    return lists.flat();
  },

  async resolve(keys) {
    const all = await this.all();
    const byKey = new Map(all.map((entry) => [`${entry.table}:${entry.id}`, entry]));
    return keys.map((key) => byKey.get(key)).filter(Boolean);
  },
};