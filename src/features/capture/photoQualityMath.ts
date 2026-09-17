import type { PhotoQualityMetrics, PhotoQualityWarning } from './captureSession';

/** Conservative starting values; tune only after representative physical-device testing. */
export const PHOTO_QUALITY_THRESHOLDS = {
  sampleWidth: 192,
  blurryLaplacianVariance: 65,
  darkLuminance: 26,
  brightLuminance: 230,
  severeExposureRatio: 0.8,
} as const;

export type PhotoQualityClassification = {
  warnings: PhotoQualityWarning[];
  metrics: PhotoQualityMetrics;
};

export function classifyPhotoPixels(
  rgba: Uint8Array,
  width: number,
  height: number,
): PhotoQualityClassification {
  if (width < 3 || height < 3 || rgba.length < width * height * 4) {
    throw new Error('The sampled image does not contain enough RGBA pixels.');
  }

  const luminance = new Float32Array(width * height);
  let darkPixels = 0;
  let brightPixels = 0;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const value = (0.2126 * rgba[offset]) + (0.7152 * rgba[offset + 1]) + (0.0722 * rgba[offset + 2]);
    luminance[pixel] = value;
    if (value <= PHOTO_QUALITY_THRESHOLDS.darkLuminance) darkPixels += 1;
    if (value >= PHOTO_QUALITY_THRESHOLDS.brightLuminance) brightPixels += 1;
  }

  let laplacianCount = 0;
  let laplacianSum = 0;
  let laplacianSquaredSum = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width) + x;
      const laplacian = (4 * luminance[index])
        - luminance[index - 1]
        - luminance[index + 1]
        - luminance[index - width]
        - luminance[index + width];
      laplacianCount += 1;
      laplacianSum += laplacian;
      laplacianSquaredSum += laplacian * laplacian;
    }
  }

  const mean = laplacianSum / laplacianCount;
  const laplacianVariance = Math.max(0, (laplacianSquaredSum / laplacianCount) - (mean * mean));
  const darkPixelRatio = darkPixels / (width * height);
  const brightPixelRatio = brightPixels / (width * height);
  const warnings: PhotoQualityWarning[] = [];

  if (laplacianVariance < PHOTO_QUALITY_THRESHOLDS.blurryLaplacianVariance) warnings.push('blurry');
  if (darkPixelRatio > PHOTO_QUALITY_THRESHOLDS.severeExposureRatio) warnings.push('too-dark');
  if (brightPixelRatio > PHOTO_QUALITY_THRESHOLDS.severeExposureRatio) warnings.push('too-bright');

  return {
    warnings,
    metrics: {
      laplacianVariance,
      darkPixelRatio,
      brightPixelRatio,
      sampleWidth: width,
      sampleHeight: height,
    },
  };
}
