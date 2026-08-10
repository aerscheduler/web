/**
 * S3 presigned-POST upload helpers. The server hands us `{ url, fields }`; we POST a multipart
 * form with every field first and the `file` part LAST (S3 requires that order), straight to S3.
 * never through our API (no Bearer header, no JSON). Mirrors the Flutter client's flow so the
 * stored URL matches (`url + "/" + fields.key`).
 */
export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export async function uploadToPresignedPost(presigned: PresignedPost, file: File): Promise<void> {
  const form = new FormData();
  for (const [k, v] of Object.entries(presigned.fields)) form.append(k, v);
  form.append("file", file); // must be appended last
  const res = await fetch(presigned.url, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
}

/** The public object URL for a completed presigned-POST upload. */
export function presignedObjectUrl(presigned: PresignedPost): string {
  return `${presigned.url.replace(/\/$/, "")}/${presigned.fields.key}`;
}
