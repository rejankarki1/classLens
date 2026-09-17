import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import type { PhotoQuality } from './captureSession';
import { classifyPhotoPixels, PHOTO_QUALITY_THRESHOLDS } from './photoQualityMath';

export async function checkPhotoQuality(uri: string): Promise<PhotoQuality> {
  let sampleFile: File | null = null;
  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: PHOTO_QUALITY_THRESHOLDS.sampleWidth, height: null });
    const rendered = await context.renderAsync();
    const sample = await rendered.saveAsync({
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    sampleFile = new File(sample.uri);

    const bytes = await sampleFile.bytes();
    const decoded = decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
      maxResolutionInMP: 1,
      maxMemoryUsageInMB: 32,
    });
    const classification = classifyPhotoPixels(decoded.data, decoded.width, decoded.height);

    return {
      status: classification.warnings.length ? 'warning' : 'good',
      warnings: classification.warnings,
      metrics: classification.metrics,
      checkedAt: new Date().toISOString(),
    };
  } catch (caught) {
    return {
      status: 'unchecked',
      warnings: [],
      metrics: null,
      checkedAt: new Date().toISOString(),
      error: caught instanceof Error ? caught.message : 'Photo quality could not be checked.',
    };
  } finally {
    try {
      sampleFile?.delete();
    } catch {
      // The sample is cache-only and the OS can remove it if cleanup fails.
    }
  }
}
