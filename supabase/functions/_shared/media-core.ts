const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_INCOMING_BYTES = 5 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 2048;

export type MediaFailureCode =
  | "MEDIA_TYPE_REJECTED"
  | "MEDIA_TOO_LARGE"
  | "MEDIA_SIGNATURE_MISMATCH"
  | "MEDIA_DIMENSIONS_REJECTED"
  | "MEDIA_NOT_AVAILABLE";

export class MediaBoundaryError extends Error {
  constructor(
    readonly code: MediaFailureCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "MediaBoundaryError";
  }
}

export interface IncomingUpload {
  mimeType: string;
  byteSize: number;
}

export interface InspectedImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
  byteSize: number;
}

export interface DecodedImage extends InspectedImage {
  sanitizedBytes: Uint8Array;
}

export type TrustedImageDecoder = (
  bytes: Uint8Array,
  declaredMimeType: string,
) => Promise<DecodedImage>;

export function validateIncomingUpload(upload: IncomingUpload): void {
  if (!ALLOWED_MIME_TYPES.has(upload.mimeType)) {
    throw new MediaBoundaryError("MEDIA_TYPE_REJECTED", 400);
  }
  if (
    !Number.isSafeInteger(upload.byteSize) ||
    upload.byteSize < 1 ||
    upload.byteSize > MAX_INCOMING_BYTES
  ) {
    throw new MediaBoundaryError("MEDIA_TOO_LARGE", 413);
  }
}

function hasBytes(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function inspectPng(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 24 ||
    !hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function inspectJpeg(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 4 || !hasBytes(bytes, 0, [0xff, 0xd8])) return null;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xff || marker === 0x00) {
      offset += 1;
      continue;
    }
    const segmentLength =
      ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (segmentLength < 2 || offset + segmentLength + 2 > bytes.length) break;
    if (startOfFrameMarkers.has(marker)) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      };
    }
    offset += segmentLength + 2;
  }
  return null;
}

function inspectWebp(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  ) {
    return null;
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    const width =
      1 +
      (bytes[24] ?? 0) +
      ((bytes[25] ?? 0) << 8) +
      ((bytes[26] ?? 0) << 16);
    const height =
      1 +
      (bytes[27] ?? 0) +
      ((bytes[28] ?? 0) << 8) +
      ((bytes[29] ?? 0) << 16);
    return { width, height };
  }
  if (chunk === "VP8 " && hasBytes(bytes, 23, [0x9d, 0x01, 0x2a])) {
    return {
      width: ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff,
      height: ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b1 = bytes[21] ?? 0;
    const b2 = bytes[22] ?? 0;
    const b3 = bytes[23] ?? 0;
    const b4 = bytes[24] ?? 0;
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  return null;
}

export function inspectStoredImage(
  bytes: Uint8Array,
  declaredMimeType: string,
): InspectedImage {
  if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) {
    throw new MediaBoundaryError("MEDIA_TYPE_REJECTED", 400);
  }
  if (bytes.byteLength > MAX_STORED_BYTES) {
    throw new MediaBoundaryError("MEDIA_TOO_LARGE", 413);
  }

  const png = inspectPng(bytes);
  const jpeg = png ? null : inspectJpeg(bytes);
  const webp = png || jpeg ? null : inspectWebp(bytes);
  const detected = png ?? jpeg ?? webp;
  const detectedMime = png
    ? "image/png"
    : jpeg
      ? "image/jpeg"
      : webp
        ? "image/webp"
        : null;

  if (!detected || !detectedMime) {
    throw new MediaBoundaryError("MEDIA_TYPE_REJECTED", 400);
  }
  if (detectedMime !== declaredMimeType) {
    throw new MediaBoundaryError("MEDIA_SIGNATURE_MISMATCH", 400);
  }
  if (
    detected.width < 1 ||
    detected.height < 1 ||
    detected.width > MAX_DIMENSION ||
    detected.height > MAX_DIMENSION
  ) {
    throw new MediaBoundaryError("MEDIA_DIMENSIONS_REJECTED", 400);
  }

  return {
    mimeType: detectedMime,
    extension:
      detectedMime === "image/jpeg"
        ? "jpg"
        : detectedMime === "image/png"
          ? "png"
          : "webp",
    width: detected.width,
    height: detected.height,
    byteSize: bytes.byteLength,
  };
}

export async function decodeStoredImage(
  bytes: Uint8Array,
  declaredMimeType: string,
  decoder: TrustedImageDecoder,
): Promise<DecodedImage> {
  validateIncomingUpload({ mimeType: declaredMimeType, byteSize: bytes.byteLength });
  if (bytes.byteLength > MAX_STORED_BYTES) {
    throw new MediaBoundaryError("MEDIA_TOO_LARGE", 413);
  }
  const original = inspectStoredImage(bytes, declaredMimeType);

  try {
    const decoded = await decoder(bytes, declaredMimeType);
    const inspected = inspectStoredImage(
      decoded.sanitizedBytes,
      declaredMimeType,
    );
    if (
      decoded.width !== inspected.width ||
      decoded.height !== inspected.height ||
      decoded.mimeType !== inspected.mimeType ||
      decoded.width !== original.width ||
      decoded.height !== original.height
    ) {
      throw new MediaBoundaryError("MEDIA_SIGNATURE_MISMATCH", 400);
    }
    return { ...inspected, sanitizedBytes: decoded.sanitizedBytes };
  } catch (error) {
    if (error instanceof MediaBoundaryError) throw error;
    throw new MediaBoundaryError("MEDIA_TYPE_REJECTED", 400);
  }
}
