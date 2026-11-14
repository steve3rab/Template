export type CompressedImage = {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  mimeType: string;
};

export type ImageCompressionOptions = {
  maxDimension?: number;
  maxSizeBytes?: number;
  quality?: number;
  maxSourceSizeBytes?: number;
};

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Unable to read the optimized image.'));
    reader.onerror = () => reject(new Error('Unable to read the optimized image.'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed.'))),
      type,
      quality,
    );
  });
}

/**
 * Resizes and converts an uploaded photo to WebP before it is sent to the API.
 * The original file is never modified. A browser without WebP encoding may
 * return PNG; the actual MIME type is taken from the resulting Blob.
 */
export async function compressImage(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<CompressedImage> {
  const {
    maxDimension = 1600,
    maxSizeBytes = 450 * 1024,
    quality = 0.82,
    maxSourceSizeBytes = 15 * 1024 * 1024,
  } = options;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Unsupported image format. Use PNG, JPEG or WebP.');
  }
  if (file.size === 0) throw new Error('The selected image is empty.');
  if (file.size > maxSourceSizeBytes) {
    throw new Error('The selected image is larger than 15 MB.');
  }

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!bitmap.width || !bitmap.height) throw new Error('The selected image is invalid.');

    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is not available in this browser.');
    context.drawImage(bitmap, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (blob.size > maxSizeBytes) {
      for (const nextQuality of [0.72, 0.62, 0.52]) {
        blob = await canvasToBlob(canvas, 'image/webp', nextQuality);
        if (blob.size <= maxSizeBytes) break;
      }
    }

    return {
      dataUrl: await readAsDataUrl(blob),
      originalSize: file.size,
      compressedSize: blob.size,
      width,
      height,
      mimeType: blob.type || 'image/png',
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Unable to process the selected image.');
  } finally {
    bitmap?.close();
  }
}
