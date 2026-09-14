const mimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
};
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export class Failure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
export async function boundedBytes(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Failure(413, 'TOO_LARGE', 'Input exceeds the allowed size.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export async function loadPhoto(origin: string, headers: Record<string, string>, materialId: string, storagePath: unknown, signal: AbortSignal, fetcher: typeof fetch, limit = 10 * 1024 * 1024) {
  const path = storagePath;
  const match = typeof path === 'string' ? /^materials\/([0-9a-f-]+)\/photo\.(jpg|png|webp|heic|heif)$/.exec(path) : null;
  if (!match || match[1] !== materialId) throw new Failure(422, 'PATH', 'Invalid photo storage path.');
  const imageResponse = await fetcher(`${origin}/storage/v1/object/authenticated/lecture-materials/${path}`, { headers, signal: signal });
  if (!imageResponse.ok) throw new Failure(502, 'STORAGE', 'Could not read the stored photo.');
  const mime = imageResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (mime !== mimeByExtension[match[2]]) throw new Failure(422, 'IMAGE_TYPE', 'Unsupported or mismatched photo format.');
  if (Number(imageResponse.headers.get('content-length')) > limit) {
    await imageResponse.body?.cancel();
    throw new Failure(413, 'TOO_LARGE', 'Photo must be 10 MiB or smaller.');
  }
  const image = await boundedBytes(imageResponse.body, limit);
  if (!image.length) throw new Failure(422, 'EMPTY_IMAGE', 'Stored photo is empty.');
  return { mime, image };
}

export function requestGemini(fetcher: typeof fetch, key: string, signal: AbortSignal, prompt: string, parts: unknown[], schema: unknown, maxOutputTokens: number) {
  return fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: prompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens, responseMimeType: 'application/json', responseJsonSchema: schema },
    }),
  });
}
