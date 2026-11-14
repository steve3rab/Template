import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImage } from './compressImage';

describe('compressImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resizes large photos and returns an optimized WebP data URL', async () => {
    const file = new File(['original-image'], 'photo.jpg', { type: 'image/jpeg' });
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 3200, height: 2400, close }) as unknown as ImageBitmap),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['compressed'], { type: 'image/webp' }));
    });

    const result = await compressImage(file);

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(result.dataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(result.originalSize).toBe(file.size);
    expect(result.compressedSize).toBeGreaterThan(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects unsupported formats before decoding the file', async () => {
    const file = new File(['not-an-image'], 'document.gif', { type: 'image/gif' });
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);

    await expect(compressImage(file)).rejects.toThrow(/unsupported image format/i);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects source files larger than the safety limit', async () => {
    const file = new File([new Uint8Array(16 * 1024 * 1024)], 'large.png', {
      type: 'image/png',
    });
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);

    await expect(compressImage(file)).rejects.toThrow(/larger than 15 MB/i);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects when the browser cannot create a 2D canvas context', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() }) as unknown as ImageBitmap),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(compressImage(file)).rejects.toThrow(/not available in this browser/i);
  });
});
