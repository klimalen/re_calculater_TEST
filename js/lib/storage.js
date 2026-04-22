import { supabase } from '../supabase.js';
import { withTimeout } from './timeout.js';

const BUCKET = 'meal-photos';

/** Upload a compressed base64 JPEG. Returns the storage path. */
export async function uploadMealPhoto(userId, mealId, base64Jpeg) {
  const path = `${userId}/${mealId}.jpg`;
  const bytes = _base64ToUint8Array(base64Jpeg);

  const { error } = await withTimeout(
    supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    })
  );
  if (error) throw error;
  return path;
}

/** Get a signed URL for displaying a meal photo (1 hour expiry) */
export async function getMealPhotoUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

/** Delete a meal photo. Silent on not-found errors. */
export async function deleteMealPhoto(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

function _base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
