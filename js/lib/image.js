/**
 * Client-side image compression.
 * Resizes to max 1200px on the long side, encodes as JPEG at 0.82 quality.
 * Target output: ~200–400KB.
 *
 * Supports JPEG, PNG, WebP, GIF, BMP, and HEIC/HEIF (iOS Safari).
 * HEIC is converted via HTMLImageElement which iOS Safari natively decodes.
 */

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.82;
const MAX_OUTPUT_BYTES = 500 * 1024; // 500KB hard limit

/** Returns compressed base64 JPEG (without data: prefix) or throws */
export async function compressImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Файл не является изображением');
  }

  const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
    || file.name.toLowerCase().endsWith('.heic')
    || file.name.toLowerCase().endsWith('.heif');

  // Load image source: HEIC needs HTMLImageElement (iOS Safari); others use createImageBitmap
  let imgSource;
  if (isHeic) {
    imgSource = await _loadViaImgElement(file);
  } else {
    try {
      imgSource = await createImageBitmap(file);
    } catch {
      // Fallback for formats createImageBitmap doesn't support in some browsers
      imgSource = await _loadViaImgElement(file);
    }
  }

  const srcWidth  = imgSource.naturalWidth  ?? imgSource.width;
  const srcHeight = imgSource.naturalHeight ?? imgSource.height;
  const { width, height } = _scaleDimensions(srcWidth, srcHeight);

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgSource, 0, 0, width, height);
  if (imgSource.close) imgSource.close(); // free ImageBitmap memory

  // Try with target quality, then lower if still too large
  let quality = JPEG_QUALITY;
  let base64;

  do {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    base64 = dataUrl.split(',')[1];
    const bytes = (base64.length * 3) / 4;
    if (bytes <= MAX_OUTPUT_BYTES) break;
    quality -= 0.1;
  } while (quality > 0.3);

  return base64;
}

async function _loadViaImgElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось загрузить изображение')); };
    img.src = url;
  });
}

/** Create an object URL preview from a file (caller must revoke it) */
export function createPreviewUrl(file) {
  return URL.createObjectURL(file);
}

function _scaleDimensions(w, h) {
  if (w <= MAX_DIMENSION && h <= MAX_DIMENSION) return { width: w, height: h };
  const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}
