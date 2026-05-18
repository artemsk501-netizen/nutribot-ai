/** MIME types accepted by OpenAI Vision for image_url data URIs */
export const OPENAI_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type OpenAiImageMime = (typeof OPENAI_IMAGE_MIMES)[number];

/** Detect image format from file magic bytes (Telegram often omits extension / sends octet-stream). */
export function detectImageMimeFromBuffer(buffer: Buffer): OpenAiImageMime {
  if (buffer.length < 12) return "image/jpeg";

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // Telegram compressed photos are almost always JPEG
  return "image/jpeg";
}

export function mimeFromFilePath(filePath: string): OpenAiImageMime | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}

export function resolveOpenAiImageMime(
  buffer: Buffer,
  contentTypeHeader: string | null,
  filePath?: string,
): OpenAiImageMime {
  const fromHeader = contentTypeHeader?.split(";")[0]?.trim().toLowerCase();
  if (fromHeader && OPENAI_IMAGE_MIMES.includes(fromHeader as OpenAiImageMime)) {
    return fromHeader as OpenAiImageMime;
  }

  const fromPath = filePath ? mimeFromFilePath(filePath) : null;
  if (fromPath) return fromPath;

  return detectImageMimeFromBuffer(buffer);
}

export function toDataImageUrl(base64: string, mimeType: OpenAiImageMime): string {
  return `data:${mimeType};base64,${base64}`;
}
