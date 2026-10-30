"use client";

import { useState } from "react";
import {
  IMAGE_DOWNSCALE_BYTES,
  IMAGE_MAX_EDGE_PX,
  isAcceptedMimeType,
  MAX_DOCUMENT_BYTES,
  type UploadRejection,
} from "@/lib/documents/constants";
import type { UploadResponse } from "@/lib/documents/types";

export interface UploadProblem {
  filename: string;
  reason: UploadRejection | "duplicate" | "network";
}

/**
 * Phone photos are often 5–12 MB (the model accepts ~5 MB per image) or HEIC: re-encode them
 * as JPEG in the browser when it can decode them.
 */
async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= IMAGE_DOWNSCALE_BYTES && isAcceptedMimeType(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.\w+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Uploads files to /api/documents and reports problems per file. */
export function useDocumentUpload(conversationId?: string) {
  const [uploading, setUploading] = useState(false);
  const [problems, setProblems] = useState<UploadProblem[]>([]);

  async function upload(selected: File[]): Promise<UploadResponse["documents"]> {
    if (selected.length === 0) return [];
    setUploading(true);
    setProblems([]);
    const found: UploadProblem[] = [];
    try {
      const prepared = await Promise.all(selected.map(downscaleImage));
      const form = new FormData();
      for (const file of prepared) {
        if (file.type && !isAcceptedMimeType(file.type))
          found.push({ filename: file.name, reason: "unsupported_type" });
        else if (file.size > MAX_DOCUMENT_BYTES)
          found.push({ filename: file.name, reason: "too_large" });
        else form.append("files", file);
      }
      if (conversationId) form.append("conversationId", conversationId);
      if (!form.has("files")) return [];

      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as UploadResponse | null;
      if (!body || !Array.isArray(body.documents)) {
        found.push({ filename: "", reason: "network" });
        return [];
      }
      found.push(...body.rejected);
      for (const doc of body.documents)
        if (doc.duplicate) found.push({ filename: doc.filename, reason: "duplicate" });
      return body.documents;
    } catch {
      found.push({ filename: "", reason: "network" });
      return [];
    } finally {
      setProblems(found);
      setUploading(false);
    }
  }

  return { upload, uploading, problems, clearProblems: () => setProblems([]) };
}
