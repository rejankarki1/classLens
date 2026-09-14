export interface Material {
  id: string;
  lectureId: string;
  type: 'photo' | 'audio' | 'pdf' | 'video';
  filePath: string;
  extractedText?: string;
}

export interface MaterialUploadInput {
  lectureId: string;
  uri: string;
  type: Material['type'];
  fileName: string;
  mimeType: string;
}
