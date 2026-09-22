import 'expo-sqlite/localStorage/install';

import { Directory, File, Paths } from 'expo-file-system';

import type { CaptureSession, CaptureSessionPhoto } from '@/features/capture/captureSession';

type StagedPhoto = Omit<CaptureSessionPhoto, 'uri'> & { uri: string; pageNumber: number };
export type StagedCaptureSession = Omit<CaptureSession, 'photos'> & { ownerId: string; photos: StagedPhoto[] };

const keyPrefix = 'classlens.processing-session.';

function store() {
  const value = globalThis.localStorage;
  if (!value) throw new Error('Durable local processing storage is unavailable.');
  return value;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 160);
}

export async function stageCaptureSession(jobId: string, ownerId: string, session: CaptureSession): Promise<StagedCaptureSession> {
  const root = new Directory(Paths.document, 'classlens-processing');
  root.create({ idempotent: true, intermediates: true });
  const directory = new Directory(root, safeSegment(jobId));
  directory.create({ idempotent: true, intermediates: true });

  const photos: StagedPhoto[] = [];
  for (let index = 0; index < session.photos.length; index += 1) {
    const source = new File(session.photos[index].uri);
    if (!source.exists) throw new Error(`Lecture page ${index + 1} is no longer available. Retake it before leaving capture.`);
    const extension = session.photos[index].mimeType === 'image/png' ? 'png' : 'jpg';
    const destination = new File(directory, `page-${index + 1}.${extension}`);
    if (!destination.exists) await source.copy(destination);
    photos.push({ ...session.photos[index], uri: destination.uri, pageNumber: index + 1 });
  }

  const staged: StagedCaptureSession = { ...session, ownerId, photos };
  store().setItem(`${keyPrefix}${jobId}`, JSON.stringify(staged));
  return staged;
}

export function getStagedCaptureSession(jobId: string, ownerId: string): StagedCaptureSession | null {
  const raw = store().getItem(`${keyPrefix}${jobId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StagedCaptureSession;
    if (parsed.ownerId !== ownerId || !Array.isArray(parsed.photos) || !parsed.photos.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function removeStagedPhoto(jobId: string, ownerId: string, photoId: string): void {
  const session = getStagedCaptureSession(jobId, ownerId);
  if (!session) return;
  const photo = session.photos.find((candidate) => candidate.id === photoId);
  if (photo) {
    const file = new File(photo.uri);
    if (file.exists) file.delete();
  }
  const photos = session.photos.filter((candidate) => candidate.id !== photoId);
  if (photos.length) store().setItem(`${keyPrefix}${jobId}`, JSON.stringify({ ...session, photos }));
  else store().removeItem(`${keyPrefix}${jobId}`);
}

/**
 * Session F phone-side sweep: clears any leftover local staging copy for a
 * job once the server has confirmed the cloud originals are gone. Under the
 * normal upload path removeStagedPhoto already clears each page right after
 * its own upload confirms, well before a job is even eligible for cleanup,
 * so this is a safety net for an interrupted upload (e.g. a crash mid-loop),
 * not the primary path -- idempotent no-op when there is nothing left.
 */
export function removeStagedJobDirectory(jobId: string): void {
  const directory = new Directory(new Directory(Paths.document, 'classlens-processing'), safeSegment(jobId));
  if (directory.exists) directory.delete();
  store().removeItem(`${keyPrefix}${jobId}`);
}
