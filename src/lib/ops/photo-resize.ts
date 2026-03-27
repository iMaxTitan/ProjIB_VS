/**
 * Resize photo to standard dimensions before saving to DB.
 * Standard: max 200×200, JPEG quality 0.7
 * Uses Canvas API — client-side only.
 */

const MAX_WIDTH = 200;
const MAX_HEIGHT = 200;
const JPEG_QUALITY = 0.7;

/** Approximate max base64 length for a 200×200 JPEG at quality 0.7 (~15-25 KB) */
const MAX_BASE64_LENGTH = 50_000;

/**
 * Ensures photo base64 string is within size limits.
 * If the photo is already small enough, returns it unchanged.
 * Otherwise resizes to 200×200 max and re-encodes as JPEG 0.7.
 */
export function ensurePhotoSize(base64: string | null): Promise<string | null> {
  if (!base64) return Promise.resolve(null);

  // Already small enough — skip resize
  if (base64.length <= MAX_BASE64_LENGTH) return Promise.resolve(base64);

  return resizeBase64Photo(base64);
}

/**
 * Resizes a base64-encoded image to max 200×200 JPEG.
 */
export function resizeBase64Photo(base64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } else {
        resolve(base64);
      }
    };

    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}
