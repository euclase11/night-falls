// js/upload.js
import { supabase } from './supabase.js';

/**
 * Загружает файл в бакет 'images' и возвращает публичную ссылку.
 * @param {string} folder — подпапка (например, 'characters')
 * @param {File} file
 * @returns {Promise<string>} публичный URL
 */
export async function uploadFile(folder, file) {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from('images')
    .upload(path, buffer, {
      contentType: file.type,
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