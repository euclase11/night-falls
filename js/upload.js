// js/upload.js
import { supabase } from './supabase.js';

/**
 * Загружает файл в бакет 'images' и возвращает публичную ссылку.
 * @param {string} folder — подпапка (например, 'characters')
 * @param {File} file
 * @returns {Promise<string>} публичный URL
 */
const MAX_SIDE = 1600;
const QUALITY = 0.82;

async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * ratio);
    const height = Math.round(bitmap.height * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    return blob;
  } catch (error) {
    console.error(error);
    return file;
  }
}

export async function uploadFile(folder, file) {
  const prepared = await compressImage(file);
  const type = prepared.type || file.type;
  const ext = type === 'image/webp' ? 'webp' : file.name.split('.').pop() || 'bin';
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = await prepared.arrayBuffer();

  const { error } = await supabase.storage
    .from('images')
    .upload(path, buffer, {
      contentType: type,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from('images').getPublicUrl(path);
  return data.publicUrl;
}

const PUBLIC_MARKER = '/storage/v1/object/public/images/';

export function imageUrlsOf(row) {
  const urls = [];
  if (row?.image_url) urls.push(row.image_url);
  if (Array.isArray(row?.images)) urls.push(...row.images);
  return urls;
}

function pathFromUrl(url) {
  const index = url.indexOf(PUBLIC_MARKER);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + PUBLIC_MARKER.length).split('?')[0]);
}

export async function deleteFiles(urls) {
  const paths = urls.map(pathFromUrl).filter(Boolean);
  if (!paths.length) return;
  const { data, error } = await supabase.storage.from('images').remove(paths);
  if (error) throw error;
  if (!data || data.length < paths.length) {
    console.warn('Не все файлы удалены из хранилища: проверьте политику delete для бакета images');
  }
}