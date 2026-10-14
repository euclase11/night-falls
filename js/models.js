// js/models.js
import { supabase } from './supabase.js';

/**
 * Базовый класс для всех записей.
 * Наследники задают static table и переопределяют toPayload()/toCard().
 */
export class Entry {
  static table = '';

  constructor(data = {}) {
    Object.assign(this, data);
  }

  /** Список записей с простыми фильтрами ({ world: 'real' }). */
  static async list(filters = {}) {
    let q = supabase.from(this.table).select('*');
    for (const [key, value] of Object.entries(filters)) {
      q = q.eq(key, value);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((row) => new this(row));
  }

  /** Получить одну запись по id. */
  static async get(id) {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return new this(data);
  }

  /** Создать или обновить запись. */
  async save() {
    const payload = this.toPayload();
    let result;

    if (this.id) {
      result = await supabase
        .from(this.constructor.table)
        .update(payload)
        .eq('id', this.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from(this.constructor.table)
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) throw result.error;
    Object.assign(this, result.data);
    return this;
  }

  /** Удалить запись. */
  async delete() {
    if (!this.id) return;
    const { error } = await supabase
      .from(this.constructor.table)
      .delete()
      .eq('id', this.id);
    if (error) throw error;
  }

  // Переопределяют наследники
  toPayload() { return {}; }
  toCard() { return {}; }
}

/* ---------- Персонаж ---------- */

export class Character extends Entry {
  static table = 'characters';

  toPayload() {
    return {
      name: this.name,
      description: this.description,
      world: this.world,
      image_url: this.image_url ?? null,
    };
  }

  toCard() {
    return {
      id: this.id,
      world: this.world,
      name: this.name,
      kind: this.role ?? '',          // в БД может не быть — тогда пусто
      meta: null,
      description: this.description,
      imageUrl: this.image_url ?? null,
      tags: this.tags ?? [],
    };
  }
}

/* ---------- Поселение ---------- */

export class Settlement extends Entry {
  static table = 'settlements';

  toPayload() {
    return {
      name: this.name,
      description: this.description,
      world: this.world,
      coordinates: this.coordinates ?? null,
      color: this.color ?? null,
      number: this.number ?? null,
    };
  }

  toCard() {
    return {
      id: this.id,
      world: this.world,
      name: this.name,
      kind: 'Поселение',
      meta: null,
      description: this.description,
      tags: [],
    };
  }
}

/* ---------- Событие ---------- */

export class Event extends Entry {
  static table = 'events';

  toPayload() {
    return {
      title: this.title,
      description: this.description,
      world: this.world,
      scope: this.scope ?? 'global',
      date: this.date ?? null,
    };
  }

  toCard() {
    return {
      id: this.id,
      world: this.world,
      name: this.title,
      kind: 'Событие',
      meta: this.date ?? null,
      description: this.description,
      tags: [],
    };
  }

  /** Для сортировки таймлайна — если нет отдельного поля order, берём id. */
  get order() {
    return this._order ?? this.id ?? 0;
  }
  set order(v) {
    this._order = v;
  }
}

/* ---------- Запись "Другое" ---------- */

export class MiscEntry extends Entry {
  static table = 'misc';

  toPayload() {
    return {
      type: this.type ?? 'Заметка',
      title: this.title,
      description: this.description,
      world: this.world,
    };
  }

  toCard() {
    return {
      id: this.id,
      world: this.world,
      name: this.title,
      kind: this.type ?? 'Запись',
      meta: null,
      description: this.description,
      tags: [],
    };
  }
}