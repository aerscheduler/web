/**
 * iPhone Photos often hands us a .HEIC name with JPEG bytes, or real HEIC.
 * Rename by magic so the S3 Content-Type matches. Decode HEIC to JPEG when the
 * browser can (Safari / iOS). If it cannot, return null: Chrome cannot open a
 * leftover HEIC on the console.
 */

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF
const HEIC_BRANDS = new Set(["heic", "heix", "heif", "mif1", "msf1", "hevc"]);
const MAX_EDGE = 2400;

export const UPLOAD_PHOTO_EXTS = ["jpg", "jpeg", "png", "pdf", "heic", "heif"] as const;

export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === JPEG[0] && bytes[1] === JPEG[1] && bytes[2] === JPEG[2];
}

export function looksLikePng(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && PNG.every((b, i) => bytes[i] === b);
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && PDF.every((b, i) => bytes[i] === b);
}

export function looksLikeHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (ftyp !== "ftyp") return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
  return HEIC_BRANDS.has(brand);
}

function stem(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  const dot = base.lastIndexOf(".");
  const raw = dot > 0 ? base.slice(0, dot) : base;
  return raw || "file";
}

async function heicToJpeg(file: File): Promise<File | null> {
  if (file.size > 25 * 1024 * 1024) return null;
  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(file, { resizeWidth: MAX_EDGE });
    } catch {
      bitmap = await createImageBitmap(file);
    }
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > MAX_EDGE || height > MAX_EDGE) {
      const scale = MAX_EDGE / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return null;
    return new File([blob], `${stem(file.name)}.jpg`, { type: "image/jpeg" });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/** Null means skip: not a photo/PDF we can store in a form everyone can open. */
export async function normalizeUploadFile(file: File, bytes?: Uint8Array): Promise<File | null> {
  const head =
    bytes && bytes.length >= 12 ? bytes.subarray(0, 16) : new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (looksLikeHeic(head)) {
    return heicToJpeg(file);
  }
  const b = bytes ?? new Uint8Array(await file.arrayBuffer());

  if (looksLikePdf(b)) {
    return new File([b], `${stem(file.name)}.pdf`, { type: "application/pdf" });
  }
  if (looksLikeJpeg(b)) {
    return new File([b], `${stem(file.name)}.jpg`, { type: "image/jpeg" });
  }
  if (looksLikePng(b)) {
    return new File([b], `${stem(file.name)}.png`, { type: "image/png" });
  }
  return null;
}
