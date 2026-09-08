import { describe, expect, it } from "vitest";
import {
  looksLikeHeic,
  looksLikeJpeg,
  looksLikePdf,
  looksLikePng,
  normalizeUploadFile,
} from "./normalize-upload-file";

const TINY_JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAACKAAB//9k="
  ),
  (c) => c.charCodeAt(0)
);

function fakeHeic(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes[4] = 0x66;
  bytes[5] = 0x74;
  bytes[6] = 0x79;
  bytes[7] = 0x70;
  bytes[8] = 0x68;
  bytes[9] = 0x65;
  bytes[10] = 0x69;
  bytes[11] = 0x63;
  return bytes;
}

describe("magic bytes", () => {
  it("recognises jpeg, png, pdf, heic", () => {
    expect(looksLikeJpeg(TINY_JPEG)).toBe(true);
    expect(looksLikePng(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(true);
    expect(looksLikePdf(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(looksLikeHeic(fakeHeic())).toBe(true);
    expect(looksLikeHeic(TINY_JPEG)).toBe(false);
  });
});

describe("normalizeUploadFile", () => {
  it("renames a JPEG that an iPhone labelled .HEIC", async () => {
    const file = new File([TINY_JPEG], "IMG_1234.HEIC", { type: "image/heic" });
    const out = await normalizeUploadFile(file);
    expect(out?.name).toBe("IMG_1234.jpg");
    expect(out?.type).toBe("image/jpeg");
  });

  it("skips a HEIC the browser cannot decode so Chrome is not left a dead file", async () => {
    const file = new File([fakeHeic()], "sheet.heic", { type: "image/heic" });
    const out = await normalizeUploadFile(file);
    expect(out).toBeNull();
  });

  it("keeps a PDF even if the name is wrong", async () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = new File([bytes], "POH.heic", { type: "image/heic" });
    const out = await normalizeUploadFile(file);
    expect(out?.name).toBe("POH.pdf");
  });

  it("renames a JPEG that was labelled .pdf", async () => {
    const file = new File([TINY_JPEG], "scan.pdf", { type: "application/pdf" });
    const out = await normalizeUploadFile(file);
    expect(out?.name).toBe("scan.jpg");
  });
});
