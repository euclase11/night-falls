// js/store.js
import { Character, Settlement, Event, MiscEntry } from './models.js';

/**
 * Слой данных для app.js.
 * Каждая функция возвращает Promise с массивом объектов в форме карточки.
 * В каждую карточку добавлено поле table — пригодится для редактирования/удаления.
 */
export const store = {
  async characters() {
    const list = await Character.list();
    return list.map((c) => ({ ...c.toCard(), table: 'characters' }));
  },

  async settlements() {
    const list = await Settlement.list();
    return list.map((s) => {
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
        imageUrl: null, // у поселений пока нет картинок
      };
    });
  },

  async events() {
    const list = await Event.list();
    return list.map((e) => ({
      id: e.id,
      table: 'events',
      world: e.world,
      title: e.title,
      description: e.description,
      scope: e.scope,
      date: e.date,
      order: e.order,
      // карточная форма
      name: e.title,
      kind: 'Событие',
      meta: e.date,
      tags: [],
      imageUrl: null,
    }));
  },

  async other() {
    const list = await MiscEntry.list();
    return list.map((m) => ({ ...m.toCard(), table: 'misc' }));
  },
};