import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { MAX_CAPTURE_PHOTOS } from '@/features/capture/captureSession';

export type CaptureImportSource = 'photos' | 'file';

export type ImportedCapturePhoto = {
  uri: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg' | 'image/png';
  fileName: string;
};

export class CaptureImportError extends Error {
  constructor(
    message: string,
    readonly code: 'permission-denied' | 'too-many' | 'unsupported' | 'unreadable',
  ) {
    super(message);
  }
}

type PickedAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
};

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const;

function normalizedMimeType(asset: PickedAsset): (typeof allowedMimeTypes)[number] | null {
  const declared = asset.mimeType?.toLowerCase().split(';')[0].trim();
  if (declared === 'image/jpg') return 'image/jpeg';
  if (allowedMimeTypes.some((type) => type === declared)) {
    return declared as (typeof allowedMimeTypes)[number];
  }

  const name = (asset.fileName || asset.uri).toLowerCase().split('?')[0];
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.heif')) return 'image/heif';
  if (name.endsWith('.webp')) return 'image/webp';
  return null;
}

function extensionFor(mimeType: (typeof allowedMimeTypes)[number]): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  return mimeType.slice('image/'.length);
}

async function chooseAssets(source: CaptureImportSource): Promise<PickedAsset[] | null> {
  if (source === 'photos') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new CaptureImportError('Allow photo access to choose images for this lecture.', 'permission-denied');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_CAPTURE_PHOTOS,
      quality: 1,
    });
    return result.canceled ? null : result.assets;
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: [...allowedMimeTypes],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  if (result.assets.length > MAX_CAPTURE_PHOTOS) {
    throw new CaptureImportError(`Choose up to ${MAX_CAPTURE_PHOTOS} images at a time.`, 'too-many');
  }
  return result.assets;
}

async function copyAsset(
  directory: Directory,
  asset: PickedAsset,
  index: number,
): Promise<ImportedCapturePhoto> {
  const mimeType = normalizedMimeType(asset);
  if (!mimeType) {
    throw new CaptureImportError('Choose JPEG, PNG, HEIC, or WebP images only.', 'unsupported');
  }

  const source = new File(asset.uri);
  if (!source.exists) {
    throw new CaptureImportError('One of the selected images could not be read.', 'unreadable');
  }

  const raw = new File(directory, `selected-${index + 1}.${extensionFor(mimeType)}`);
  await source.copy(raw);

  const context = ImageManipulator.manipulate(raw.uri);
  const rendered = await context.renderAsync();
  const shouldNormalize = mimeType === 'image/heic' || mimeType === 'image/heif' || mimeType === 'image/webp';

  if (!shouldNormalize) {
    const outputMimeType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    return {
      uri: raw.uri,
      width: asset.width && asset.width > 0 ? asset.width : rendered.width,
      height: asset.height && asset.height > 0 ? asset.height : rendered.height,
      mimeType: outputMimeType,
      fileName: `classlens-import-${index + 1}.${outputMimeType === 'image/png' ? 'png' : 'jpg'}`,
    };
  }

  const normalized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  const destination = new File(directory, `selected-${index + 1}.jpg`);
  const normalizedFile = new File(normalized.uri);
  await normalizedFile.copy(destination);
  normalizedFile.delete();
  raw.delete();

  return {
    uri: destination.uri,
    width: normalized.width,
    height: normalized.height,
    mimeType: 'image/jpeg',
    fileName: `classlens-import-${index + 1}.jpg`,
  };
}

export async function pickCapturePhotos(
  source: CaptureImportSource,
  sessionId: string,
): Promise<ImportedCapturePhoto[] | null> {
  const assets = await chooseAssets(source);
  if (!assets) return null;
  if (!assets.length) throw new CaptureImportError('No images were selected.', 'unreadable');

  const root = new Directory(Paths.cache, 'classlens-imports');
  root.create({ idempotent: true, intermediates: true });
  const directory = new Directory(root, sessionId.replace(/[^a-zA-Z0-9_-]/g, '_'));
  if (directory.exists) directory.delete();
  directory.create({ idempotent: true, intermediates: true });

  try {
    const photos: ImportedCapturePhoto[] = [];
    for (let index = 0; index < assets.length; index += 1) {
      photos.push(await copyAsset(directory, assets[index], index));
    }
    return photos;
  } catch (error) {
    if (directory.exists) directory.delete();
    throw error;
  }
}
