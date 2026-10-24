/**
 * A picture file made ready for a survey: checked, and made smaller for the
 * web - no side longer than MAX_SIDE, saved as WebP (or PNG or JPEG where the
 * browser cannot write WebP). A GIF is kept as it is, so an animation stays
 * one. The server checks again whatever reaches it (backend/api/images.php),
 * by what the file is rather than what it is called.
 */

/** The kinds of picture a survey takes. No SVG: it is a document that can carry scripts, not just a picture. */
export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

/** The largest file taken in, before it is made smaller. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** The largest picture the server keeps (IMAGE_MAX_BYTES in backend/api/images.php) - only a big GIF comes near it. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The longest side a picture is kept at: sharp on a phone held close, and on a wide screen. */
export const MAX_SIDE = 1600;

/** How many pictures a question, an option and a step's own text may carry (SURVEY_MAX_*_IMAGES in backend/api/survey_rules.php). */
export const MAX_QUESTION_IMAGES = 10;
export const MAX_OPTION_IMAGES = 4;
export const MAX_STEP_IMAGES = 10;

export class ImageError extends Error {}

/** Why a file cannot be a survey's picture, in words for the editor - or null when it can. */
export function imageFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" is not a picture this survey can show - use PNG, JPEG, WebP, GIF or AVIF.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`;
  }
  return null;
}

/** The files among these that are pictures - what a drop or a paste may hold besides them is left out. */
export function pictureFiles(files: FileList | readonly File[] | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
}

/**
 * The pictures a paste (or a drop) means to add - none when it carries text.
 * A spreadsheet puts a picture of the copied cells beside their text, and the
 * text is what was meant; a picture copied from a page may come with just its
 * address as text, and the picture is what was meant.
 */
export function pastedPictures(data: DataTransfer | null | undefined): File[] {
  const pictures = pictureFiles(data?.files);
  if (!pictures.length) {
    return [];
  }
  const text = (data?.getData('text/plain') ?? '').trim();
  return !text || /^https?:\/\/\S+$/i.test(text) ? pictures : [];
}

/**
 * A first description of a picture, from its file's name: "hu-tao_portrait.png"
 * → "hu tao portrait". Names a camera gives ("IMG_2041") say nothing, so they
 * give nothing.
 */
export function altFromFileName(name: string): string {
  const words = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return /^(img|dsc|pxl|image|photo|screenshot|snimka|screen shot)\b/i.test(words) || !/\p{L}{2}/u.test(words) ? '' : words;
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const problem = imageFileProblem(file);
  if (problem) {
    throw new ImageError(problem);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError(`"${file.name}" could not be read as a picture.`);
  }
  const { width, height } = bitmap;
  if (file.type === 'image/gif') {
    bitmap.close();
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ImageError(`"${file.name}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB - a moving picture is kept as it is, so it cannot be made smaller.`);
    }
    return { blob: file, width, height };
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return { blob: file, width, height };
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let blob = await toBlob(canvas, 'image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') {
    // PNG keeps what is see-through; a photo is smaller as JPEG.
    blob = await toBlob(canvas, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.86);
  }
  // Nothing to shrink and nothing gained: the file as it came - but never an
  // AVIF, which not every server can read yet.
  if (!blob || (scale === 1 && blob.size >= file.size && file.type !== 'image/avif')) {
    return { blob: file, width, height };
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new ImageError(`"${file.name}" is still larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB after it was made smaller.`);
  }
  return { blob, width: w, height: h };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
