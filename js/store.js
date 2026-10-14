// js/store.js
import { Character, Settlement, Event, MiscEntry } from './models.js';

/**
 * Слой данных для app.js.
 * Каждая функция возвращает Promise с массивом объектов,
 * приведённых к форме, которую ожидает render.js.
 */
export const store = {
  async characters() {
    const list = await Character.list();
    return list.map((c) => c.toCard());
  },

  async settlements() {
    const list = await Settlement.list();
    return list.map((s) => ({
      id: s.id,
      world: s.world,
      name: s.name,
      description: s.description,
      coordinates: s.coordinates,
      color: s.color,
      number: s.number,
      // для карточек во вкладке "Другое"
      kind: 'Поселение',
      meta: null,
      tags: [],
    }));
  },

  async events() {
    const list = await Event.list();
    return list.map((e) => ({
      id: e.id,
      world: e.world,
      title: e.title,
      description: e.description,
      scope: e.scope,
      date: e.date,
      order: e.order,
      // для карточек во вкладке "Другое"
      name: e.title,
      kind: 'Событие',
      meta: e.date,
      tags: [],
    }));
  },

  async other() {
    const list = await MiscEntry.list();
    return list.map((m) => m.toCard());
  },
};