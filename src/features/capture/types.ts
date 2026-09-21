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

export type CaptureStatus = 'uploaded' | 'analyzing' | 'analyzed' | 'failed';

export interface CaptureRecord {
  id: string;
  sessionId: string;
  clientPhotoId: string;
  pageNumber: number;
  storagePath: string;
  mimeType: 'image/jpeg' | 'image/png';
  capturedAt: string;
  status: CaptureStatus;
}

export interface CaptureUploadInput {
  sessionId: string;
  clientPhotoId: string;
  pageNumber: number;
  uri: string;
  mimeType: 'image/jpeg' | 'image/png';
  capturedAt: string;
}

export type CaptureReadability = 'clear' | 'partial' | 'unreadable';

export interface CapturePhotoAnalysis {
  captureId: string;
  pageNumber: number;
  readability: CaptureReadability;
  faithfulExtraction: string;
  unclearSections: string[];
}

export interface CaptureAnalysis {
  sessionId: string;
  photos: CapturePhotoAnalysis[];
  combinedSummary: string;
  concepts: string[];
  examples: string[];
  assignments: string[];
  examMentions: string[];
  courseSignals: string[];
  topicSignals: string[];
}
