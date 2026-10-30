"use client";

/**
 * CONTRACT (owned by the documents area): paperclip button for the chat composer. Uploads one or
 * more files (PDF/JPG/PNG/WebP, camera on mobile) to /api/documents and reports them back.
 */
export interface UploadedDocument {
  id: string;
  filename: string;
}

export interface DocumentUploadButtonProps {
  conversationId: string;
  onUploaded: (documents: UploadedDocument[]) => void;
  disabled?: boolean;
}

export function DocumentUploadButton(_props: DocumentUploadButtonProps) {
  return null;
}
