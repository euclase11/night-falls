import { uploadFile } from './upload.js';

const WORLD_FIELD = {
  name: 'world',
  label: 'Мир',
  type: 'select',
  options: [
    ['real', 'Реальный мир'],
    ['afterlife', 'Посмертие'],
  ],
  default: 'real',
};

const LINKS_FIELD = { name: 'links', label: 'Связанные записи', type: 'links' };
const IMAGES_FIELD = { name: 'images', label: 'Связанные изображения', type: 'images' };

function checkImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Файл должен быть изображением');
  if (file.size > 5 * 1024 * 1024) throw new Error('Картинка больше 5 МБ');
}

async function resolveImages(folder, value) {
  const urls = [...value.keep];
  for (const file of value.files) {
    checkImage(file);
    urls.push(await uploadFile(folder, file));
  }
  return urls;
}

export const FORMS = {
  characters: {
    table: 'characters',
    title: 'Добавить персонажа',
    button: '+ Добавить персонажа',
    fields: [
      { name: 'name', label: 'Имя', type: 'text', required: true, maxLength: 80 },
      { name: 'description', label: 'Описание', type: 'textarea', rows: 4, maxLength: 2000 },
      WORLD_FIELD,
      { name: 'image', label: 'Главная картинка', type: 'file', accept: 'image/*' },
      IMAGES_FIELD,
      LINKS_FIELD,
    ],
    async toRow(v, existing) {
      let imageUrl = existing?.image_url ?? null;
      if (v.image) {
        checkImage(v.image);
        imageUrl = await uploadFile('characters', v.image);
      }
      return {
        name: v.name.trim(),
        description: v.description.trim(),
        world: v.world,
        image_url: imageUrl,
        images: await resolveImages('characters', v.images),
        links: v.links,
      };
    },
  },

  events: {
    table: 'events',
    title: 'Добавить событие',
    button: '+ Добавить событие',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text', required: true, maxLength: 120 },
      { name: 'description', label: 'Описание', type: 'textarea', rows: 4 },
      WORLD_FIELD,
      {
        name: 'scope',
        label: 'Масштаб',
        type: 'select',
        options: [['global', 'Глобальный сюжет'], ['local', 'Локальный сюжет']],
        default: 'global',
      },
      { name: 'date', label: 'Дата (как показывать на таймлайне)', type: 'text' },
      IMAGES_FIELD,
      LINKS_FIELD,
    ],
    async toRow(v) {
      return {
        title: v.title.trim(),
        description: v.description.trim(),
        world: v.world,
        scope: v.scope,
        date: v.date.trim() || null,
        images: await resolveImages('events', v.images),
        links: v.links,
      };
    },
  },

  settlements: {
    table: 'settlements',
    title: 'Добавить поселение',
    button: '+ Добавить поселение',
    fields: [
      { name: 'name', label: 'Название', type: 'text', required: true, maxLength: 80 },
      { name: 'description', label: 'Описание', type: 'textarea', rows: 4 },
      WORLD_FIELD,
      { name: 'x', label: 'X на карте (%)', type: 'number', step: '0.01' },
      { name: 'y', label: 'Y на карте (%)', type: 'number', step: '0.01' },
      { name: 'color', label: 'Цвет точки', type: 'color', default: '#ff5555' },
      { name: 'number', label: 'Номер на карте', type: 'number' },
      IMAGES_FIELD,
      LINKS_FIELD,
    ],
    toValues(raw) {
      return { ...raw, x: raw.coordinates?.x, y: raw.coordinates?.y };
    },
    async toRow(v) {
      return {
        name: v.name.trim(),
        description: v.description.trim(),
        world: v.world,
        coordinates: { x: Number(v.x) || 0, y: Number(v.y) || 0 },
        color: v.color.trim() || null,
        number: v.number ? Number(v.number) : null,
        images: await resolveImages('settlements', v.images),
        links: v.links,
      };
    },
  },

  misc: {
    table: 'misc',
    title: 'Добавить запись',
    button: '+ Добавить запись',
    fields: [
      { name: 'type', label: 'Тип', type: 'text', required: true, placeholder: 'Заметка, Артефакт, ...' },
      { name: 'title', label: 'Название', type: 'text', required: true, maxLength: 120 },
      { name: 'description', label: 'Описание', type: 'textarea', rows: 4 },
      WORLD_FIELD,
      IMAGES_FIELD,
      LINKS_FIELD,
    ],
    async toRow(v) {
      return {
        type: v.type.trim(),
        title: v.title.trim(),
        description: v.description.trim(),
        world: v.world,
        images: await resolveImages('misc', v.images),
        links: v.links,
      };
    },
  },

  gallery: {
    table: 'gallery',
    title: 'Добавить в галерею',
    button: '+ Добавить картинку',
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, maxLength: 120 },
      { name: 'description', label: 'Описание', type: 'textarea', rows: 3 },
      WORLD_FIELD,
      { name: 'image', label: 'Картинка', type: 'file', accept: 'image/*' },
      LINKS_FIELD,
    ],
    async toRow(v, existing) {
      let imageUrl = existing?.image_url ?? null;
      if (v.image) {
        checkImage(v.image);
        imageUrl = await uploadFile('gallery', v.image);
      }
      if (!imageUrl) throw new Error('Выберите картинку');
      return {
        title: v.title.trim(),
        description: v.description.trim(),
        world: v.world,
        image_url: imageUrl,
        links: v.links,
      };
    },
  },
};