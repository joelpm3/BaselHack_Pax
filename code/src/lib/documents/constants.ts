/** Upload limits and accepted formats. Shared by the upload button (client) and the API (server). */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 20;
/** Images above this size are downscaled in the browser before upload (model input limit ~5 MB). */
export const IMAGE_DOWNSCALE_BYTES = 3.5 * 1024 * 1024;
export const IMAGE_MAX_EDGE_PX = 2400;

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(value);
}

/** Fields below this confidence are highlighted in the review card. */
export const LOW_CONFIDENCE = 0.75;

export const UPLOAD_REJECTIONS = [
  "too_large",
  "unsupported_type",
  "too_many_pages",
  "unreadable",
  "empty",
] as const;
export type UploadRejection = (typeof UPLOAD_REJECTIONS)[number];
