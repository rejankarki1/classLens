import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const uploadResizeMaxLongEdge = 2000;
export const uploadCompressQuality = 0.7;

/** Produces a JPEG upload copy capped at 2000px on the long edge; never upscales a smaller original. */
export async function resizeForUpload(uri: string, width: number, height: number): Promise<{ uri: string; byteSize: number }> {
  const context = ImageManipulator.manipulate(uri);
  const longEdge = Math.max(width, height);
  if (longEdge > uploadResizeMaxLongEdge) {
    if (width >= height) context.resize({ width: uploadResizeMaxLongEdge, height: null });
    else context.resize({ width: null, height: uploadResizeMaxLongEdge });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: uploadCompressQuality, format: SaveFormat.JPEG });
  const file = new File(saved.uri);
  return { uri: saved.uri, byteSize: file.size ?? 0 };
}
