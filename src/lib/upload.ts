/**
 * S3 presigned-POST upload helpers. The server hands us `{ url, fields }`; we POST a multipart
 * form with every field first and the `file` part LAST (S3 requires that order), straight to S3.
 * never through our API (no Bearer header, no JSON). Mirrors the Flutter client's flow so the
 * stored URL matches (`url + "/" + fields.key`).
 */
export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
  /**
   * The size ceiling the server actually signed into this POST, in bytes.
   *
   * Sent so no client has to keep its own copy of the number. The ceiling differs by what is
   * being uploaded (a profile image is not a scanned annual), and a client with a hard-coded
   * limit either refuses a file S3 would have taken or accepts one it will reject with an
   * error nothing here parses. Optional because an older server does not send it.
   */
  maxBytes?: number;
}

/** `52428800` as `50 MB`, for a message somebody can act on. */
function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export async function uploadToPresignedPost(presigned: PresignedPost, file: File): Promise<void> {
  // Checked BEFORE the upload, against the ceiling the server signed. S3 answers a
  // content-length-range violation with a 400 and an XML body, so without this the reader
  // gets "Upload failed (400)" for the one failure they could actually do something about.
  if (typeof presigned.maxBytes === "number" && file.size > presigned.maxBytes) {
    throw new Error(
      `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${mb(presigned.maxBytes)}.`
    );
  }

  const form = new FormData();
  for (const [k, v] of Object.entries(presigned.fields)) form.append(k, v);
  form.append("file", file); // must be appended last
  const res = await fetch(presigned.url, { method: "POST", body: form });
  if (!res.ok) {
    // S3 uses 400 with an EntityTooLarge body for an over-size POST, not 413.
    const body = await res.text().catch(() => "");
    if (body.includes("EntityTooLarge")) {
      throw new Error(
        presigned.maxBytes ? `That file is too large. The limit is ${mb(presigned.maxBytes)}.` : "That file is too large."
      );
    }
    throw new Error(`Upload failed (${res.status})`);
  }
}

/** The public object URL for a completed presigned-POST upload. */
export function presignedObjectUrl(presigned: PresignedPost): string {
  return `${presigned.url.replace(/\/$/, "")}/${presigned.fields.key}`;
}
