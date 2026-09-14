export interface Material {
  id: string;
  /** Null until this staged material is attached to a persisted lecture. */
  lectureId: string | null;
  type: 'photo' | 'audio' | 'pdf' | 'video';
  /** Object path within lecture-materials, mapped from storage_path; not a URL. */
  filePath: string;
  extractedText?: string;
}

export interface MaterialUploadInput {
  uri: string;
  type: Material['type'];
  fileName: string;
  mimeType: string;
}
