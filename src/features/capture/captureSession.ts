export const MAX_CAPTURE_PHOTOS = 6;

export type CaptureSessionPhoto = {
  id: string;
  uri: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg' | 'image/png';
  fileName: string;
  capturedAt: string;
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
    && typeof photo.capturedAt === 'string';
}
