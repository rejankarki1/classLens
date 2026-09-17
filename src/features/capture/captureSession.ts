export const MAX_CAPTURE_PHOTOS = 6;

export type PhotoQualityWarning = 'blurry' | 'too-dark' | 'too-bright';
export type PhotoQualityStatus = 'checking' | 'good' | 'warning' | 'accepted-anyway' | 'unchecked';

export type PhotoQualityMetrics = {
  laplacianVariance: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  sampleWidth: number;
  sampleHeight: number;
};

export type PhotoQuality = {
  status: PhotoQualityStatus;
  warnings: PhotoQualityWarning[];
  metrics: PhotoQualityMetrics | null;
  checkedAt?: string;
  error?: string;
};

export type CaptureSessionPhoto = {
  id: string;
  uri: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg' | 'image/png';
  fileName: string;
  capturedAt: string;
  quality: PhotoQuality;
};

export type CaptureSession = {
  version: 1;
  id: string;
  createdAt: string;
  photos: CaptureSessionPhoto[];
};

export function serializeCaptureSession(session: CaptureSession): string {
  return JSON.stringify(session);
}

export function parseCaptureSession(value: string): CaptureSession {
  const parsed: unknown = JSON.parse(value);
  if (!isCaptureSession(parsed)) throw new Error('The capture session is invalid.');
  return parsed;
}

function isCaptureSession(value: unknown): value is CaptureSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<CaptureSession>;
  return session.version === 1
    && typeof session.id === 'string'
    && typeof session.createdAt === 'string'
    && Array.isArray(session.photos)
    && session.photos.length > 0
    && session.photos.length <= MAX_CAPTURE_PHOTOS
    && session.photos.every(isCaptureSessionPhoto);
}

function isCaptureSessionPhoto(value: unknown): value is CaptureSessionPhoto {
  if (!value || typeof value !== 'object') return false;
  const photo = value as Partial<CaptureSessionPhoto>;
  return typeof photo.id === 'string'
    && typeof photo.uri === 'string'
    && photo.uri.length > 0
    && typeof photo.width === 'number'
    && typeof photo.height === 'number'
    && (photo.mimeType === 'image/jpeg' || photo.mimeType === 'image/png')
    && typeof photo.fileName === 'string'
    && typeof photo.capturedAt === 'string'
    && isPhotoQuality(photo.quality);
}

function isPhotoQuality(value: unknown): value is PhotoQuality {
  if (!value || typeof value !== 'object') return false;
  const quality = value as Partial<PhotoQuality>;
  return (quality.status === 'checking'
      || quality.status === 'good'
      || quality.status === 'warning'
      || quality.status === 'accepted-anyway'
      || quality.status === 'unchecked')
    && Array.isArray(quality.warnings)
    && quality.warnings.every((warning) => warning === 'blurry' || warning === 'too-dark' || warning === 'too-bright')
    && (quality.metrics === null || isPhotoQualityMetrics(quality.metrics))
    && (quality.checkedAt === undefined || typeof quality.checkedAt === 'string')
    && (quality.error === undefined || typeof quality.error === 'string');
}

function isPhotoQualityMetrics(value: unknown): value is PhotoQualityMetrics {
  if (!value || typeof value !== 'object') return false;
  const metrics = value as Partial<PhotoQualityMetrics>;
  return typeof metrics.laplacianVariance === 'number'
    && typeof metrics.darkPixelRatio === 'number'
    && typeof metrics.brightPixelRatio === 'number'
    && typeof metrics.sampleWidth === 'number'
    && typeof metrics.sampleHeight === 'number';
}
