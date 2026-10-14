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